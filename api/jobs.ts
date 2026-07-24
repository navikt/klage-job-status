import type { Context } from '@api/context';
import { ErrorEnum } from '@api/error';
import { formatJobKey, validateJobKey } from '@api/job-key';
import { LOGS } from '@api/logging';
import { getSpanId, getTraceId } from '@api/trace-id';
import type { CreateJobInput } from '@api/types';
import { isJob, isJobEvent, type Job, type JobEvent, JobEventType, type JobKey, Status } from '@common/common';
import { GlideClient, type GlideString, ProtocolVersion, type PubSubMsg, TimeUnit } from '@valkey/valkey-glide';

const VALKEY_URI = process.env.REDIS_URI_KLAGE_JOB_STATUS;
const VALKEY_USERNAME = process.env.REDIS_USERNAME_KLAGE_JOB_STATUS;
const VALKEY_PASSWORD = process.env.REDIS_PASSWORD_KLAGE_JOB_STATUS;

/** 30 days */
const DELETE_JOB_AFTER = 60 * 60 * 24 * 30;
/** 10 minutes */
const DEFAULT_JOB_TIMEOUT = 60 * 10;

type Listener = (event: JobEvent) => void;

const toStr = (value: GlideString): string => (typeof value === 'string' ? value : value.toString());

interface ParsedUri {
  host: string;
  port: number;
  useTLS: boolean;
}

const parseValkeyUri = (uri: string | undefined): ParsedUri => {
  if (uri === undefined) {
    throw new Error('Missing Valkey URI');
  }

  const url = new URL(uri);

  return {
    host: url.hostname,
    port: url.port.length > 0 ? Number(url.port) : 6379,
    useTLS: url.protocol === 'rediss:' || url.protocol === 'valkeys:',
  };
};

class Jobs {
  #client: GlideClient | undefined;

  #channelListeners = new Map<string, Set<Listener>>();
  #patternListeners = new Map<string, Set<Listener>>();

  #isReady = false;

  #traceId = getTraceId();
  #spanId = getSpanId();

  get #valkey(): GlideClient {
    if (this.#client === undefined) {
      throw new Error('Valkey client is not initialized');
    }

    return this.#client;
  }

  #onPubSubMessage = (msg: PubSubMsg) => {
    try {
      const message: unknown = JSON.parse(toStr(msg.message));

      if (!isJobEvent(message)) {
        return;
      }

      if (msg.pattern !== null && msg.pattern !== undefined) {
        const listeners = this.#patternListeners.get(toStr(msg.pattern));
        listeners?.forEach((listener) => {
          listener(message);
        });
        return;
      }

      const listeners = this.#channelListeners.get(toStr(msg.channel));
      listeners?.forEach((listener) => {
        listener(message);
      });
    } catch (error) {
      LOGS.error('Error handling pub/sub message', this.#traceId, this.#spanId, 'valkey', {
        error: error instanceof Error ? error : 'Unknown error',
      });
    }
  };

  public get isReady() {
    return this.#isReady;
  }

  public async init() {
    const { host, port, useTLS } = parseValkeyUri(VALKEY_URI);

    this.#client = await GlideClient.createClient({
      addresses: [{ host, port }],
      useTLS,
      credentials: VALKEY_PASSWORD === undefined ? undefined : { username: VALKEY_USERNAME, password: VALKEY_PASSWORD },
      protocol: ProtocolVersion.RESP3,
      pubsubSubscriptions: {
        channelsAndPatterns: {},
        callback: this.#onPubSubMessage,
      },
    });

    LOGS.debug('Connected to Valkey client', this.#traceId, this.#spanId, 'init');
    await this.#clean();
    this.#isReady = true;
  }

  #keys = async (pattern: string): Promise<string[]> => {
    const result = await this.#valkey.customCommand(['KEYS', pattern]);
    return Array.isArray(result) ? result.map((key) => toStr(key as GlideString)) : [];
  };

  #clean = async () => {
    // Clean up invalid jobs
    const keys = await this.#keys('*');

    if (keys.length === 0) {
      LOGS.debug('No jobs to clean up', this.#traceId, this.#spanId, 'clean');
      return;
    }

    const jobs = await this.#valkey.mget(keys);

    let index = -1;
    const keysToDelete: string[] = [];

    for (const job of jobs) {
      index++;

      if (job === null) {
        continue;
      }

      try {
        const parsedJob: unknown = JSON.parse(toStr(job));

        if (isJob(parsedJob)) {
          // Job is valid. Nothing to clean up.
          continue;
        }
      } catch (error) {
        // Job is not valid JSON. Log the error and delete the job.
        LOGS.error(`Error parsing job ${toStr(job)}`, this.#traceId, this.#spanId, 'clean', {
          error: error instanceof Error ? error : 'Unknown error',
        });
      }

      const key = keys[index];

      if (key === undefined) {
        LOGS.error(`Missing key for invalid job ${toStr(job)}`, this.#traceId, this.#spanId, 'clean');
        continue;
      }

      // Add the key to the list of keys to delete.
      keysToDelete.push(key);
    }

    if (keysToDelete.length === 0) {
      LOGS.debug('No invalid jobs found', this.#traceId, this.#spanId, 'clean');
      return;
    }

    LOGS.warn(`Deleting invalid jobs: ${keysToDelete.join(', ')}`, this.#traceId, this.#spanId, 'clean');
    // Delete all invalid jobs.
    await this.#valkey.del(keysToDelete);

    // Publish delete events for all invalid jobs.
    const publishPromises: Promise<void>[] = [];

    for (const key of keysToDelete) {
      const [namespace, id] = key.split(':');

      if (namespace === undefined || id === undefined) {
        LOGS.error(`Invalid key format: "${key}"`, this.#traceId, this.#spanId, 'clean');
        continue;
      }

      publishPromises.push(this.#publish({ eventType: JobEventType.DELETED, job: { id, namespace } }));
    }

    await Promise.all(publishPromises);

    if (keysToDelete.length === 0) {
      LOGS.debug('No invalid jobs found', this.#traceId, this.#spanId, 'clean');
      return;
    }

    LOGS.debug(`Deleted ${keysToDelete.length} invalid jobs`, this.#traceId, this.#spanId, 'clean');
  };

  public async create(
    log: Context,
    namespace: string,
    jobId: string,
    input?: CreateJobInput,
  ): Promise<[Job, null] | [null, ErrorEnum]> {
    const isValid = validateJobKey(log, namespace, jobId);

    if (!isValid) {
      return [null, ErrorEnum.INVALID_JOB_ID];
    }

    const jobKey: JobKey = { id: jobId, namespace };

    if (await this.#exists(jobKey)) {
      return [null, ErrorEnum.ALREADY_EXISTS];
    }

    const now = Date.now();
    const timeout = input?.timeout === undefined ? DEFAULT_JOB_TIMEOUT : Math.min(input.timeout, DELETE_JOB_AFTER);

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
          expiry: { type: TimeUnit.Seconds, count: DELETE_JOB_AFTER },
        }),
        this.#publish({ job: createJob, eventType: JobEventType.CREATED }),
      ]);

      setTimeout(async () => {
        log.debug(`Job "${key}" timed out after ${createJob.timeout} seconds`, { jobId, namespace });

        const [existingJob, getError] = await this.#get(log, jobKey);

        if (getError !== null) {
          if (getError !== ErrorEnum.NOT_FOUND) {
            log.error(`Failed to get job "${key}" for timeout update`, { jobId, namespace, error: getError });
          }
          return;
        }

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
  }

  #get = async (log: Context, jobKey: JobKey): Promise<[Job, null] | [null, ErrorEnum]> => {
    const key = formatJobKey(jobKey);
    const fetchedJob = await this.#valkey.get(key);

    if (fetchedJob === null) {
      log.warn(`Job "${key}" not found`);
      return [null, ErrorEnum.NOT_FOUND];
    }

    const jobStr = toStr(fetchedJob);
    const job: unknown = JSON.parse(jobStr);

    if (!isJob(job)) {
      log.error(`Invalid job ${key}\n${jobStr}`);
      this.#delete(log, jobKey);
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
    if (jobId.length === 0 || namespace.length === 0) {
      log.debug(`Tried to get job with invalid ID or namespace - "${jobId}" "${namespace}"`);
      return [null, ErrorEnum.INVALID_JOB_ID];
    }

    return await this.#get(log, { id: jobId, namespace });
  }

  public async getAll(log: Context, namespace: string): Promise<Job[]> {
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

      const parsedJob: unknown = JSON.parse(toStr(job));

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
          expiry: { type: TimeUnit.Seconds, count: DELETE_JOB_AFTER },
        }),
        this.#publish({ job: updatedJob, eventType: JobEventType.UPDATED }),
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
    if (!validateJobKey(log, namespace, jobId)) {
      return [null, ErrorEnum.INVALID_JOB_ID];
    }

    const jobKey: JobKey = { id: jobId, namespace };

    const [existing, error] = await this.#get(log, jobKey);

    if (error !== null) {
      return [null, error];
    }

    return await this.#update(log, existing, inputStatus);
  }

  #delete = async (log: Context, jobKey: JobKey): Promise<ErrorEnum | null> => {
    const { id: jobId, namespace } = jobKey;
    try {
      const key = formatJobKey(jobKey);
      await Promise.all([this.#valkey.del([key]), this.#publish({ eventType: JobEventType.DELETED, job: jobKey })]);
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
    const isValid = validateJobKey(log, namespace, jobId);

    if (!isValid) {
      return ErrorEnum.INVALID_JOB_ID;
    }

    return await this.#delete(log, { id: jobId, namespace });
  }

  #exists = async (jobKey: JobKey): Promise<boolean> => (await this.#valkey.exists([formatJobKey(jobKey)])) !== 0;

  public async getNamespaces(log: Context): Promise<string[]> {
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
  }

  public async subscribe(log: Context, namespace: string, jobId: string, listener: Listener) {
    const isValid = validateJobKey(log, namespace, jobId);

    if (!isValid) {
      return;
    }

    const channel = formatJobKey({ id: jobId, namespace });
    const listeners = this.#channelListeners.get(channel) ?? new Set<Listener>();
    const isNewChannel = listeners.size === 0;
    listeners.add(listener);
    this.#channelListeners.set(channel, listeners);

    if (isNewChannel) {
      await this.#valkey.subscribeLazy([channel]);
    }
  }

  public async unsubscribe(log: Context, namespace: string, jobId: string) {
    if (!validateJobKey(log, namespace, jobId)) {
      return;
    }

    const jobKey: JobKey = { id: jobId, namespace };
    const channel = formatJobKey(jobKey);
    const listeners = this.#channelListeners.get(channel);

    if (listeners === undefined) {
      return;
    }

    this.#channelListeners.delete(channel);
    await this.#valkey.unsubscribeLazy([channel]);
  }

  public async subscribeAll(namespace: string, listener: Listener) {
    const pattern = `${namespace}:*`;
    const listeners = this.#patternListeners.get(pattern) ?? new Set<Listener>();
    const isNewPattern = listeners.size === 0;
    listeners.add(listener);
    this.#patternListeners.set(pattern, listeners);

    if (isNewPattern) {
      await this.#valkey.psubscribeLazy([pattern]);
    }
  }

  public async unsubscribeAll(namespace: string) {
    const pattern = `${namespace}:*`;
    const listeners = this.#patternListeners.get(pattern);

    if (listeners === undefined) {
      return;
    }

    this.#patternListeners.delete(pattern);
    await this.#valkey.punsubscribeLazy([pattern]);
  }

  async #publish(event: JobEvent) {
    await this.#valkey.publish(JSON.stringify(event), formatJobKey(event.job));
  }

  public async ping() {
    const res = await this.#valkey.ping();
    return res.length > 0;
  }
}

export const JOBS = new Jobs();

const shouldSetTimedOut = (job: Job, now = Date.now()): boolean =>
  job.status === Status.RUNNING && job.created + job.timeout * 1000 < now;
