export enum Status {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RUNNING = 'RUNNING',
  TIMEOUT = 'TIMEOUT',
}

const STATUSES = [Status.SUCCESS, Status.FAILED, Status.RUNNING];

export const isStatus = (status: unknown): status is Status => STATUSES.includes(status as Status);

export interface JobKey {
  id: string; // Unique, within the namespace, identifier for the job.
  namespace: string; // Namespace the job belongs to.
}

interface BaseJob extends JobKey {
  name?: string;
  created: number; // Unix timestamp when the job status was created.
  modified: number; // Unix timestamp when the job status was last modified.
  timeout: number; // Seconds until the job times out.
}

interface RunningJob extends BaseJob {
  status: Status.RUNNING;
  ended: null; // Null if the job is still running.
}

interface CompletedJob extends BaseJob {
  status: Status.SUCCESS | Status.FAILED | Status.TIMEOUT;
  ended: number; // Unix timestamp when the job ended.
}

export type Job = RunningJob | CompletedJob;

export const isJob = (data: unknown): data is Job =>
  data !== null && typeof data === 'object' && 'status' in data && 'created' in data;

export const validateLength = (value: string, min: number, max: number): boolean =>
  value.length > min && value.length < max;

export const NAMESPACE_REGEX = /^[a-z\d-_]+$/;
export const NAMESPACE_MAX_LENGTH = 64;
export const NAMESPACE_MIN_LENGTH = 3;

export const isValidNamespace = (namespace: string): boolean => {
  if (!validateLength(namespace, NAMESPACE_MIN_LENGTH, NAMESPACE_MAX_LENGTH)) {
    return false;
  }

  return NAMESPACE_REGEX.test(namespace);
};

export enum JobEventType {
  CREATED = 'created',
  UPDATED = 'updated',
  DELETED = 'deleted',
}

export const JOB_EVENT_TYPES = Object.values(JobEventType);

export const isJobEventType = (event: unknown): event is JobEventType =>
  JOB_EVENT_TYPES.includes(event as JobEventType);

export interface DeleteJobEvent {
  job: JobKey;
  eventType: JobEventType.DELETED;
}

export interface CreateJobEvent {
  job: Job;
  eventType: JobEventType.CREATED;
}

export interface UpdateJobEvent {
  job: Job;
  eventType: JobEventType.UPDATED;
}

export type JobEvent = CreateJobEvent | UpdateJobEvent | DeleteJobEvent;

export const isJobEvent = (data: unknown): data is JobEvent => {
  if (data === null || typeof data !== 'object') {
    return false;
  }

  if ('job' in data && 'eventType' in data && isJobEventType(data.eventType)) {
    if (data.eventType === JobEventType.DELETED) {
      return isJobKey(data.job);
    }
    return isJob(data.job);
  }

  return false;
};

export const isJobKey = (data: unknown): data is JobKey => {
  if (data === null || typeof data !== 'object') {
    return false;
  }

  return 'id' in data && 'namespace' in data;
};
