import { ErrorEnum } from '@api/error';
import { formatJobKey, validateJobKey } from '@api/job-key';
import type { CreateJobInput } from '@api/types';
import { type Job, type JobEvent, JobEventType, type JobKey, Status, isJob, isJobEvent } from '@common/common';
import { type RedisClientType, createClient } from 'redis';

const VALKEY_URI = process.env.REDIS_URI_KLAGE_JOB_STATUS;
const VALKEY_USERNAME = process.env.REDIS_USERNAME_KLAGE_JOB_STATUS;
const VALKEY_PASSWORD = process.env.REDIS_PASSWORD_KLAGE_JOB_STATUS;

const DELETE_JOB_AFTER = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_JOB_TIMEOUT = 60 * 10; // 10 minutes

type Listener = (event: JobEvent) => void;

class Jobs {
  #client: RedisClientType;
  #subscribeClient: RedisClientType;

  constructor() {
    this.#client = createClient({
      url: VALKEY_URI,
      username: VALKEY_USERNAME,
      password: VALKEY_PASSWORD,
      pingInterval: 3_000,
    });
    this.#client.on('error', (error) => console.error({ msg: 'Valkey Data Client Error', error }));

    this.#subscribeClient = this.#client.duplicate();
    this.#subscribeClient.on('error', (error) => console.error({ msg: 'Valkey Subscribe Client Error', error }));
  }

  public async init() {
    await Promise.all([this.#subscribeClient.connect(), this.#client.connect()]);
    console.debug('Connected to Valkey Data and Subscribe clients');
  }

  public async create(
    namespace: string,
    jobId: string,
    input?: CreateJobInput,
  ): Promise<[Job, null] | [null, ErrorEnum]> {
    const isValid = validateJobKey(namespace, jobId);

    if (!isValid) {
      return [null, ErrorEnum.INVALID_JOB_ID];
    }

    const jobKey: JobKey = { id: jobId, namespace };

    if (await this.#exists(jobKey)) {
      return [null, ErrorEnum.ALREADY_EXISTS];
    }

    const now = Date.now();
    const timeout = input?.timeout === undefined ? DEFAULT_JOB_TIMEOUT : Math.min(input.timeout, DELETE_JOB_AFTER);

    const job: Job = {
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
      const json = JSON.stringify(job);
      await Promise.all([
        this.#client.set(key, json, {
          expiration: { type: 'EX', value: DELETE_JOB_AFTER }, // EX seconds -- Set the specified expire time, in seconds (a positive integer).
        }),
        this.#publish({ job, eventType: JobEventType.CREATED }),
      ]);

      return [job, null];
    } catch (error) {
      console.error({ msg: 'Error setting job data', error });
      return [null, ErrorEnum.UNKNOWN];
    }
  }

  #get = async (jobKey: JobKey): Promise<[Job, null] | [null, ErrorEnum]> => {
    const key = formatJobKey(jobKey);
    const fetchedJob = await this.#client.get(key);

    if (fetchedJob === null) {
      console.warn(`Job "${key}" not found`);
      return [null, ErrorEnum.NOT_FOUND];
    }

    const job: unknown = JSON.parse(fetchedJob);

    if (!isJob(job)) {
      console.error(`Invalid job ${key}\n${fetchedJob}`);
      this.#delete(jobKey);
      return [null, ErrorEnum.NOT_FOUND];
    }

    if (shouldSetTimedOut(job)) {
      console.warn(`Job "${key}" has timed out`);
      const [expiredJob, updateError] = await this.#update(job, Status.TIMEOUT);

      return updateError === null ? [expiredJob, null] : [null, updateError];
    }

    return [job, null];
  };

  public async get(namespace: string, jobId: string): Promise<[Job, null] | [null, ErrorEnum]> {
    if (jobId.length === 0 || namespace.length === 0) {
      console.debug(`Tried to get job with invalid ID or namespace - "${jobId}" "${namespace}"`);
      return [null, ErrorEnum.INVALID_JOB_ID];
    }

    return await this.#get({ id: jobId, namespace });
  }

  public async getAll(namespace: string): Promise<Job[]> {
    const keys = await this.#client.keys(`${namespace}:*`);

    if (keys.length === 0) {
      return [];
    }

    const jobs = await this.#client.mGet(keys);

    const parsedJobs: Job[] = [];

    for (const job of jobs) {
      if (job === null) {
        continue;
      }

      const parsedJob: unknown = JSON.parse(job);

      if (!isJob(parsedJob)) {
        console.error(`Invalid job ${job}`);
        continue;
      }

      if (shouldSetTimedOut(parsedJob)) {
        const [expiredJob, updateError] = await this.#update(parsedJob, Status.TIMEOUT);

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

  async #update(existing: Job, inputStatus: Status): Promise<[Job, null] | [null, ErrorEnum]> {
    const alreadyEnded = existing.ended !== null;

    const key = formatJobKey(existing);

    if (alreadyEnded) {
      if (inputStatus === existing.status) {
        return [existing, null];
      }

      console.warn(
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
        this.#client.set(key, json),
        this.#publish({ job: updatedJob, eventType: JobEventType.UPDATED }),
      ]);
    } catch (error) {
      console.error('Error updating job data', error);
      return [null, ErrorEnum.ERROR_UPDATING];
    }

    return [updatedJob, null];
  }

  public async update(namespace: string, jobId: string, inputStatus: Status): Promise<[Job, null] | [null, ErrorEnum]> {
    if (!validateJobKey(namespace, jobId)) {
      return [null, ErrorEnum.INVALID_JOB_ID];
    }

    const jobKey: JobKey = { id: jobId, namespace };

    const [existing, error] = await this.#get(jobKey);

    if (error !== null) {
      return [null, error];
    }

    return await this.#update(existing, inputStatus);
  }

  #delete = async (jobKey: JobKey): Promise<ErrorEnum | null> => {
    try {
      const key = formatJobKey(jobKey);
      await Promise.all([this.#client.del(key), this.#publish({ eventType: JobEventType.DELETED, job: jobKey })]);
      console.debug(`Deleted job "${key}"`);
    } catch (error) {
      console.error('Error deleting job data', error);
      return ErrorEnum.ERROR_DELETING;
    }

    return null;
  };

  public async delete(namespace: string, jobId: string): Promise<ErrorEnum | null> {
    const isValid = validateJobKey(namespace, jobId);

    if (!isValid) {
      return ErrorEnum.INVALID_JOB_ID;
    }

    return await this.#delete({ id: jobId, namespace });
  }

  #exists = async (jobKey: JobKey): Promise<boolean> => (await this.#client.exists(formatJobKey(jobKey))) !== 0;

  public async getNamespaces(): Promise<string[]> {
    const keys = await this.#client.keys('*');
    const namespaces = new Set<string>();

    for (const key of keys) {
      const parts = key.split(':');

      if (parts.length < 2) {
        console.warn(`Invalid key format: ${key}`);
        continue;
      }

      const [namespace] = parts;

      if (namespace === undefined) {
        console.warn(`Invalid namespace in key: ${key}`);
        continue;
      }

      namespaces.add(namespace);
    }

    return Array.from(namespaces);
  }

  public async subscribe(namespace: string, jobId: string, listener: Listener) {
    const isValid = validateJobKey(namespace, jobId);

    if (!isValid) {
      return;
    }

    await this.#subscribeClient.subscribe(formatJobKey({ id: jobId, namespace }), (message) => {
      const event: unknown = JSON.parse(message);

      if (isJobEvent(event)) {
        listener(event);
      }
    });
  }

  public async unsubscribe(namespace: string, jobId: string) {
    if (!validateJobKey(namespace, jobId)) {
      return;
    }

    const jobKey: JobKey = { id: jobId, namespace };

    await this.#subscribeClient.unsubscribe(formatJobKey(jobKey));
  }

  public async subscribeAll(namespace: string, listener: Listener) {
    await this.#subscribeClient.pSubscribe(`${namespace}:*`, (message) => {
      const event: unknown = JSON.parse(message);

      if (isJobEvent(event)) {
        listener(event);
      }
    });
  }

  public async unsubscribeAll(namespace: string) {
    await this.#subscribeClient.pUnsubscribe(`${namespace}:*`);
  }

  async #publish(event: JobEvent) {
    await this.#client.publish(formatJobKey(event.job), JSON.stringify(event));
  }

  public async ping() {
    const res = await this.#client.ping();
    return res.length > 0;
  }
}

export const JOBS = new Jobs();

const shouldSetTimedOut = (job: Job, now = Date.now()): boolean =>
  job.status === Status.RUNNING && job.created + job.timeout * 1000 < now;
