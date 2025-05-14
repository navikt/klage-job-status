export enum Status {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RUNNING = 'RUNNING',
}

interface BaseJob {
  name?: string;
  created: number; // Unix timestamp when the job status was created.
  modified: number; // Unix timestamp when the job status was last modified.
}

interface RunningJob extends BaseJob {
  status: Status.RUNNING;
  ended: null; // Null if the job is still running.
}

interface CompletedJob extends BaseJob {
  status: Status.SUCCESS | Status.FAILED;
  ended: number; // Unix timestamp when the job ended.
}

export type Job = RunningJob | CompletedJob;

export const isJob = (data: unknown): data is Job =>
  data !== null && typeof data === 'object' && 'status' in data && 'created' in data;
