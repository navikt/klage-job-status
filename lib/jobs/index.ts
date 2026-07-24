import { isJob, type Job, JobEventType, type JobKey, Status } from '@common/common';
import { GlideClient, type GlideString, ProtocolVersion, TimeUnit } from '@valkey/valkey-glide';
import type { Context } from '@/lib/context';
import { ErrorEnum } from '@/lib/error';
import { cleanInvalidJobs, setTTLForEndedJobs } from '@/lib/jobs/cleanup';
import { formatJobKey, validateJobKey } from '@/lib/jobs/key';
import { type JobEventListener, JobPubSub, type Unsubscribe } from '@/lib/jobs/pubsub';
import { parseValkeyUri } from '@/lib/jobs/valkey-uri';
import { toStr } from '@/lib/jobs/valkey-utils';
import { parseJson } from '@/lib/json';
import { LOGS } from '@/lib/logging';
import { withSpan } from '@/lib/tracer';
import type { CreateJobInput } from '@/lib/types';

/** 30 days, in seconds. */
const DEFAULT_DELETE_JOB_AFTER = 60 * 60 * 24 * 30;
/** 10 minutes */
const DEFAULT_JOB_TIMEOUT = 60 * 10;

/** Narrows a `customCommand` result element to `GlideString` (`string | Buffer`). */
const isGlideString = (value: unknown): value is GlideString => typeof value === 'string' || Buffer.isBuffer(value);

export interface ValkeyConnection {
  uri: string | undefined;
  username?: string;
  password?: string;
}

class Jobs {
  #client: GlideClient | undefined;

  /** Seconds until a job is deleted from Valkey, regardless of its status. */
  #deleteJobAfter: number = DEFAULT_DELETE_JOB_AFTER;

  #pubsub = new JobPubSub(() => this.#valkey);

  #isReady = false;
  #initPromise: Promise<void> | undefined;

  get #valkey(): GlideClient {
    if (this.#client === undefined) {
      throw new Error('Valkey client is not initialized');
    }

    return this.#client;
  }

  public get isReady() {
    return this.#isReady;
  }

  public init(connection: ValkeyConnection, deleteJobAfter: number = DEFAULT_DELETE_JOB_AFTER): Promise<void> {
    if (this.#initPromise !== undefined) {
      LOGS.warn('init() called again - reusing the existing connection attempt', 'init');
      return this.#initPromise;
    }

    this.#initPromise = this.#connect(connection, deleteJobAfter).catch((error: unknown) => {
      // Allow a subsequent call to retry after a genuine failure.
      this.#initPromise = undefined;
      throw error;
    });

    return this.#initPromise;
  }

  async #connect(connection: ValkeyConnection, deleteJobAfter: number) {
    return withSpan('jobs.connect', {}, async () => {
      this.#deleteJobAfter = deleteJobAfter;

      const { host, port, useTLS } = parseValkeyUri(connection.uri);

      this.#client = await GlideClient.createClient({
        addresses: [{ host, port }],
        useTLS,
        credentials:
          connection.password === undefined
            ? undefined
            : { username: connection.username, password: connection.password },
        protocol: ProtocolVersion.RESP3,
        pubsubSubscriptions: {
          channelsAndPatterns: {},
          callback: this.#pubsub.onMessage,
        },
      });

      LOGS.debug('Connected to Valkey client', 'init');

      // Enable Valkey's "keyevent" notifications for expired keys, so a job that reaches its
      // `DELETE_JOB_AFTER_SECONDS` TTL without ever being explicitly deleted still triggers a
      // live `DELETED` event for subscribers (see `JobPubSub#subscribeToExpiredKeys`). This is a
      // best-effort enhancement - some managed Valkey/Redis providers disallow `CONFIG SET`, so we
      // must not let a failure here prevent the service from becoming ready.
      try {
        await this.#valkey.customCommand(['CONFIG', 'SET', 'notify-keyspace-events', 'Ex']);
        await this.#pubsub.subscribeToExpiredKeys();
      } catch (error: unknown) {
        LOGS.warn(`Failed to enable expired-key notifications, continuing without them: ${error}`, 'init');
      }

      await cleanInvalidJobs(this.#valkey, this.#keys, (event) => this.#pubsub.publish(event));
      await setTTLForEndedJobs(this.#valkey, this.#keys, this.#deleteJobAfter);
      this.#isReady = true;
    });
  }

  #keys = async (pattern: string): Promise<string[]> => {
    const result = await this.#valkey.customCommand(['KEYS', pattern]);

    if (!Array.isArray(result)) {
      return [];
    }

    return result.filter(isGlideString).map(toStr);
  };

  public async create(
    log: Context,
    namespace: string,
    jobId: string,
    input?: CreateJobInput,
  ): Promise<[Job, null] | [null, ErrorEnum]> {
    return withSpan('jobs.create', { namespace, 'job.id': jobId }, async () => {
      const isValid = validateJobKey(log, namespace, jobId);

      if (!isValid) {
        return [null, ErrorEnum.INVALID_JOB_ID];
      }

      const jobKey: JobKey = { id: jobId, namespace };

      if (await this.#exists(jobKey)) {
        return [null, ErrorEnum.ALREADY_EXISTS];
      }

      const now = Date.now();
      const timeout =
        input?.timeout === undefined ? DEFAULT_JOB_TIMEOUT : Math.min(input.timeout, this.#deleteJobAfter);

      const createJob: Job = {
        id: jobId,
        namespace,
        name: input?.name,
        created: now,
        modified: now,
        status: Status.RUNNING,
        ended: null,
        timeout,
      };

      try {
        const key = formatJobKey(jobKey);
        const json = JSON.stringify(createJob);
        await Promise.all([
          this.#valkey.set(key, json, {
            expiry: { type: TimeUnit.Seconds, count: this.#deleteJobAfter },
          }),
          this.#pubsub.publish({ job: createJob, eventType: JobEventType.CREATED }),
        ]);

        setTimeout(async () => {
          const [existingJob, getError] = await this.#get(log, jobKey);

          if (getError !== null) {
            if (getError !== ErrorEnum.NOT_FOUND) {
              log.error(`Failed to get job "${key}" for timeout update`, { jobId, namespace, error: getError });
            }
            return;
          }

          if (existingJob.ended !== null) {
            // The job already ended (successfully, or was already marked as timed out by
            // `#get` above) before this watchdog fired - nothing to do.
            return;
          }

          log.debug(`Job "${key}" timed out after ${createJob.timeout} seconds`, { jobId, namespace });

          const [, updateError] = await this.#update(log, existingJob, Status.TIMEOUT);

          if (updateError !== null) {
            log.error(`Failed to update job "${key}" to TIMEOUT`, { jobId, namespace, error: updateError });
            return;
          }

          log.debug(`Set job "${key}" status to TIMEOUT`, { jobId, namespace });
        }, createJob.timeout * 1000);

        return [createJob, null];
      } catch (error) {
        log.error('Error setting job data', {
          jobId,
          namespace,
          error: error instanceof Error ? error : 'Unknown error',
        });

        return [null, ErrorEnum.UNKNOWN];
      }
    });
  }

  #get = async (log: Context, jobKey: JobKey): Promise<[Job, null] | [null, ErrorEnum]> => {
    const key = formatJobKey(jobKey);
    const fetchedJob = await this.#valkey.get(key);

    if (fetchedJob === null) {
      log.warn(`Job "${key}" not found`);
      return [null, ErrorEnum.NOT_FOUND];
    }

    const jobStr = toStr(fetchedJob);
    const job = parseJson(jobStr);

    if (!isJob(job)) {
      log.error(`Invalid job ${key}\n${jobStr}`);
      await this.#delete(log, jobKey);
      return [null, ErrorEnum.NOT_FOUND];
    }

    if (shouldSetTimedOut(job)) {
      log.warn(`Job "${key}" has timed out`);
      const [expiredJob, updateError] = await this.#update(log, job, Status.TIMEOUT);

      return updateError === null ? [expiredJob, null] : [null, updateError];
    }

    return [job, null];
  };

  public async get(log: Context, namespace: string, jobId: string): Promise<[Job, null] | [null, ErrorEnum]> {
    return withSpan('jobs.get', { namespace, 'job.id': jobId }, async () => {
      if (jobId.length === 0 || namespace.length === 0) {
        log.debug(`Tried to get job with invalid ID or namespace - "${jobId}" "${namespace}"`);
        return [null, ErrorEnum.INVALID_JOB_ID];
      }

      return await this.#get(log, { id: jobId, namespace });
    });
  }

  public async getAll(log: Context, namespace: string): Promise<Job[]> {
    return withSpan('jobs.get-all', { namespace }, async () => {
      const keys = await this.#keys(`${namespace}:*`);

      if (keys.length === 0) {
        return [];
      }

      const jobs = await this.#valkey.mget(keys);

      const parsedJobs: Job[] = [];

      for (const job of jobs) {
        if (job === null) {
          continue;
        }

        const parsedJob = parseJson(toStr(job));

        if (!isJob(parsedJob)) {
          log.error(`Invalid job ${toStr(job)}`);
          continue;
        }

        if (shouldSetTimedOut(parsedJob)) {
          const [expiredJob, updateError] = await this.#update(log, parsedJob, Status.TIMEOUT);

          if (updateError !== null) {
            continue;
          }

          parsedJobs.push(expiredJob);
          continue;
        }

        parsedJobs.push(parsedJob);
      }

      return parsedJobs;
    });
  }

  async #update(log: Context, existing: Job, inputStatus: Status): Promise<[Job, null] | [null, ErrorEnum]> {
    const alreadyEnded = existing.ended !== null;

    const key = formatJobKey(existing);

    if (alreadyEnded) {
      if (inputStatus === existing.status) {
        return [existing, null];
      }

      log.warn(
        `Failed to update job "${key}" from status "${existing.status}" to "${inputStatus}" - ${ErrorEnum.ALREADY_ENDED}`,
      );
      return [null, ErrorEnum.ALREADY_ENDED];
    }

    const now = Date.now();
    const status = shouldSetTimedOut(existing, now) ? Status.TIMEOUT : inputStatus;
    const ended = status === Status.TIMEOUT ? existing.created + existing.timeout * 1000 : now;
    const hasEndedStatus = status !== Status.RUNNING;

    const updatedJob: Job = hasEndedStatus
      ? { ...existing, status, modified: now, ended }
      : { ...existing, status, modified: now, ended: null };

    try {
      const json = JSON.stringify(updatedJob);
      await Promise.all([
        this.#valkey.set(key, json, {
          expiry: { type: TimeUnit.Seconds, count: this.#deleteJobAfter },
        }),
        this.#pubsub.publish({ job: updatedJob, eventType: JobEventType.UPDATED }),
      ]);
    } catch (error) {
      const { id: jobId, namespace } = existing;
      log.error('Error updating job data', {
        jobId,
        namespace,
        error: error instanceof Error ? error : 'Unknown error',
      });

      return [null, ErrorEnum.ERROR_UPDATING];
    }

    return [updatedJob, null];
  }

  public async update(
    log: Context,
    namespace: string,
    jobId: string,
    inputStatus: Status,
  ): Promise<[Job, null] | [null, ErrorEnum]> {
    return withSpan('jobs.update', { namespace, 'job.id': jobId, 'job.status': inputStatus }, async () => {
      if (!validateJobKey(log, namespace, jobId)) {
        return [null, ErrorEnum.INVALID_JOB_ID];
      }

      const jobKey: JobKey = { id: jobId, namespace };

      const [existing, error] = await this.#get(log, jobKey);

      if (error !== null) {
        return [null, error];
      }

      return await this.#update(log, existing, inputStatus);
    });
  }

  #delete = async (log: Context, jobKey: JobKey): Promise<ErrorEnum | null> => {
    const { id: jobId, namespace } = jobKey;
    try {
      const key = formatJobKey(jobKey);
      await Promise.all([
        this.#valkey.del([key]),
        this.#pubsub.publish({ eventType: JobEventType.DELETED, job: jobKey }),
      ]);
      log.debug(`Deleted job "${key}"`, { jobId, namespace });
    } catch (error) {
      log.error('Error deleting job data', {
        jobId,
        namespace,
        error: error instanceof Error ? error : 'Unknown error',
      });

      return ErrorEnum.ERROR_DELETING;
    }

    return null;
  };

  public async delete(log: Context, namespace: string, jobId: string): Promise<ErrorEnum | null> {
    return withSpan('jobs.delete', { namespace, 'job.id': jobId }, async () => {
      const isValid = validateJobKey(log, namespace, jobId);

      if (!isValid) {
        return ErrorEnum.INVALID_JOB_ID;
      }

      return await this.#delete(log, { id: jobId, namespace });
    });
  }

  #exists = async (jobKey: JobKey): Promise<boolean> => (await this.#valkey.exists([formatJobKey(jobKey)])) !== 0;

  public async getNamespaces(log: Context): Promise<string[]> {
    return withSpan('jobs.get-namespaces', {}, async () => {
      const keys = await this.#keys('*');
      const namespaces = new Set<string>();

      for (const key of keys) {
        const parts = key.split(':');

        if (parts.length < 2) {
          log.warn(`Invalid key format: ${key}`);
          continue;
        }

        const [namespace] = parts;

        if (namespace === undefined) {
          log.warn(`Invalid namespace in key: ${key}`);
          continue;
        }

        namespaces.add(namespace);
      }

      return Array.from(namespaces);
    });
  }

  public async subscribe(
    log: Context,
    namespace: string,
    jobId: string,
    listener: JobEventListener,
  ): Promise<Unsubscribe | null> {
    if (!validateJobKey(log, namespace, jobId)) {
      return null;
    }

    return this.#pubsub.subscribe({ id: jobId, namespace }, listener);
  }

  public async unsubscribe(log: Context, namespace: string, jobId: string, listener: JobEventListener) {
    if (!validateJobKey(log, namespace, jobId)) {
      return;
    }

    await this.#pubsub.unsubscribe({ id: jobId, namespace }, listener);
  }

  public async subscribeNamespace(namespace: string, listener: JobEventListener): Promise<Unsubscribe> {
    return this.#pubsub.subscribeNamespace(namespace, listener);
  }

  public async unsubscribeNamespace(namespace: string, listener: JobEventListener) {
    await this.#pubsub.unsubscribeNamespace(namespace, listener);
  }

  public async ping() {
    return withSpan('jobs.ping', {}, async () => {
      const res = await this.#valkey.ping();
      return res.length > 0;
    });
  }
}

/**
 * Keep a single `Jobs` instance (and thus one Valkey connection with its pub/sub
 * subscriptions) per server process, surviving dev-mode module reloads. The connection
 * is established once at startup by `instrumentation.ts`.
 */
const globalForJobs = globalThis as unknown as { __JOBS__?: Jobs };

export const JOBS: Jobs = globalForJobs.__JOBS__ ?? new Jobs();
globalForJobs.__JOBS__ = JOBS;

const shouldSetTimedOut = (job: Job, now = Date.now()): boolean =>
  job.status === Status.RUNNING && job.created + job.timeout * 1000 < now;
