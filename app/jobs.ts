import { getJobId } from '@app/helpers';
import { type CreateJobInput, ErrorEnum, type JobParams } from '@app/types';
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

  public async create(jobParams: JobParams, input?: CreateJobInput): Promise<ErrorEnum | null> {
    const jobId = getJobId(jobParams);

    if (jobId === null) {
      return ErrorEnum.INVALID_JOB_ID;
    }

    if (await this.#exists(jobId)) {
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
      await this.#client.set(jobId, JSON.stringify(job), {
        expiration: { type: 'EX', value: timeout === undefined ? DEFAULT_TIMEOUT : Math.min(timeout, MAX_TIMEOUT) },
      });

      return null;
    } catch (error) {
      console.error({ msg: 'Error setting job data', error });
      return ErrorEnum.UNKNOWN;
    }
  }

  #get = async (jobId: string): Promise<[Job, null] | [null, ErrorEnum]> => {
    const job = await this.#client.get(jobId);

    if (job === null) {
      return [null, ErrorEnum.NOT_FOUND];
    }

    const parsedJob: unknown = JSON.parse(job);

    if (!isJob(parsedJob)) {
      console.error({ msg: 'Invalid job', jobId, status: job });
      this.#delete(jobId);
      return [null, ErrorEnum.NOT_FOUND];
    }

    return [parsedJob, null];
  };

  public async get(jobParams: JobParams): Promise<[Job, null] | [null, ErrorEnum]> {
    const jobId = getJobId(jobParams);

    if (jobId === null) {
      return [null, ErrorEnum.INVALID_JOB_ID];
    }

    return await this.#get(jobId);
  }

  public async update(jobParams: JobParams, status: Status): Promise<ErrorEnum | null> {
    const jobId = getJobId(jobParams);

    if (jobId === null) {
      return ErrorEnum.INVALID_JOB_ID;
    }

    const [existing, error] = await this.#get(jobId);

    if (error !== null) {
      return error;
    }

    const alreadyEnded = existing.ended !== null;

    if (alreadyEnded) {
      return status === existing.status ? null : ErrorEnum.ALREADY_ENDED;
    }

    const ended = status === Status.SUCCESS || status === Status.FAILED;
    const now = Date.now();

    const updatedJob: Job = ended
      ? { ...existing, status, modified: now, ended: now }
      : { ...existing, status, modified: now, ended: null };

    try {
      const json = JSON.stringify(updatedJob);
      await Promise.all([this.#client.set(jobId, json), this.#client.publish(jobId, json)]);
    } catch (error) {
      console.error({ msg: 'Error updating job data', error });
      return ErrorEnum.ERROR_UPDATING;
    }

    return null;
  }

  #delete = async (jobId: string): Promise<ErrorEnum | null> => {
    try {
      await this.#client.del(jobId);
    } catch (error) {
      console.error({ msg: 'Error deleting job data', error });
      return ErrorEnum.ERROR_DELETING;
    }

    return null;
  };

  public async delete(jobParams: JobParams): Promise<ErrorEnum | null> {
    const jobId = getJobId(jobParams);

    if (jobId === null) {
      return ErrorEnum.INVALID_JOB_ID;
    }

    return await this.#delete(jobId);
  }

  #exists = async (jobId: string): Promise<boolean> => (await this.#client.exists(jobId)) !== 0;

  public async subscribe(jobParams: JobParams, listener: Listener) {
    const jobId = getJobId(jobParams);

    if (jobId === null) {
      return;
    }

    await this.#subscribeClient.subscribe(jobId, (message) => {
      const job: unknown = JSON.parse(message);

      if (isJob(job)) {
        listener(job);
      }
    });
  }

  public async unsubscribe(jobParams: JobParams) {
    const jobId = getJobId(jobParams);

    if (jobId === null) {
      return;
    }

    await this.#subscribeClient.unsubscribe(jobId);
  }

  public async ping() {
    const res = await this.#client.ping();
    return res.length > 0;
  }
}

export const JOBS = new Jobs();
