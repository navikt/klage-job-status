import { ErrorEnum } from '@app/error';
import { getJobKey } from '@app/job-key';
import type { CreateJobInput } from '@app/types';
import { type Job, Status, isJob } from '@common/common';
import { type RedisClientType, createClient } from 'redis';

const VALKEY_URI = process.env.REDIS_URI_KLAGE_JOB_STATUS;
const VALKEY_USERNAME = process.env.REDIS_USERNAME_KLAGE_JOB_STATUS;
const VALKEY_PASSWORD = process.env.REDIS_PASSWORD_KLAGE_JOB_STATUS;

const MAX_TIMEOUT = 60 * 60 * 24; // 1 day
const DEFAULT_TIMEOUT = 60 * 10; // 10 minutes

type Listener = (job: Job) => void;

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

  public async create(namespace: string, jobId: string, input?: CreateJobInput): Promise<ErrorEnum | null> {
    const key = getJobKey(namespace, jobId);

    if (key === null) {
      return ErrorEnum.INVALID_JOB_ID;
    }

    if (await this.#exists(key)) {
      return ErrorEnum.ALREADY_EXISTS;
    }

    const now = Date.now();

    const job: Job = {
      name: input?.name,
      created: now,
      modified: now,
      status: Status.RUNNING,
      ended: null,
    };

    const timeout = input?.timeout;

    try {
      // EX seconds -- Set the specified expire time, in seconds (a positive integer).
      await this.#client.set(key, JSON.stringify(job), {
        expiration: { type: 'EX', value: timeout === undefined ? DEFAULT_TIMEOUT : Math.min(timeout, MAX_TIMEOUT) },
      });

      return null;
    } catch (error) {
      console.error({ msg: 'Error setting job data', error });
      return ErrorEnum.UNKNOWN;
    }
  }

  #get = async (key: string): Promise<[Job, null] | [null, ErrorEnum]> => {
    const job = await this.#client.get(key);

    if (job === null) {
      console.warn(`Job "${key}" not found`);
      return [null, ErrorEnum.NOT_FOUND];
    }

    const parsedJob: unknown = JSON.parse(job);

    if (!isJob(parsedJob)) {
      console.error(`Invalid job ${key}\n${job}`);
      this.#delete(key);
      return [null, ErrorEnum.NOT_FOUND];
    }

    return [parsedJob, null];
  };

  public async get(namespace: string, jobId: string): Promise<[Job, null] | [null, ErrorEnum]> {
    const key = getJobKey(namespace, jobId);

    if (key === null) {
      return [null, ErrorEnum.INVALID_JOB_ID];
    }

    return await this.#get(key);
  }

  public async getAll(namespace: string): Promise<Job[]> {
    const keys = await this.#client.keys(`${namespace}:*`);
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

      parsedJobs.push(parsedJob);
    }

    return parsedJobs;
  }

  public async update(namespace: string, jobId: string, status: Status): Promise<ErrorEnum | null> {
    const key = getJobKey(namespace, jobId);

    if (key === null) {
      return ErrorEnum.INVALID_JOB_ID;
    }

    const [existing, error] = await this.#get(key);

    if (error !== null) {
      return error;
    }

    const alreadyEnded = existing.ended !== null;

    if (alreadyEnded) {
      if (status === existing.status) {
        return null;
      }

      console.warn(
        `Failed to update job "${key}" from status "${existing.status}" to "${status}" - ${ErrorEnum.ALREADY_ENDED}`,
      );
      return ErrorEnum.ALREADY_ENDED;
    }

    const ended = status === Status.SUCCESS || status === Status.FAILED;
    const now = Date.now();

    const updatedJob: Job = ended
      ? { ...existing, status, modified: now, ended: now }
      : { ...existing, status, modified: now, ended: null };

    try {
      const json = JSON.stringify(updatedJob);
      await Promise.all([this.#client.set(key, json), this.#client.publish(key, json)]);
    } catch (error) {
      console.error('Error updating job data', error);
      return ErrorEnum.ERROR_UPDATING;
    }

    return null;
  }

  #delete = async (key: string): Promise<ErrorEnum | null> => {
    try {
      await this.#client.del(key);
      console.debug(`Deleted job "${key}"`);
    } catch (error) {
      console.error('Error deleting job data', error);
      return ErrorEnum.ERROR_DELETING;
    }

    return null;
  };

  public async delete(namespace: string, jobId: string): Promise<ErrorEnum | null> {
    const key = getJobKey(namespace, jobId);

    if (key === null) {
      return ErrorEnum.INVALID_JOB_ID;
    }

    return await this.#delete(key);
  }

  #exists = async (key: string): Promise<boolean> => (await this.#client.exists(key)) !== 0;

  public async subscribe(namespace: string, jobId: string, listener: Listener) {
    const key = getJobKey(namespace, jobId);

    if (key === null) {
      return;
    }

    await this.#subscribeClient.subscribe(key, (message) => {
      const job: unknown = JSON.parse(message);

      if (isJob(job)) {
        listener(job);
      }
    });
  }

  public async unsubscribe(namespace: string, jobId: string) {
    const key = getJobKey(namespace, jobId);

    if (key === null) {
      return;
    }

    await this.#subscribeClient.unsubscribe(key);
  }

  public async ping() {
    const res = await this.#client.ping();
    return res.length > 0;
  }
}

export const JOBS = new Jobs();
