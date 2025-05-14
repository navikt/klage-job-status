export interface JobParams {
  jobId: string;
  namespace: string;
}

export enum ErrorEnum {
  NOT_FOUND = 0,
  ALREADY_ENDED = 1,
  ALREADY_EXISTS = 2,
  ERROR_UPDATING = 3,
  ERROR_DELETING = 4,
  INVALID_JOB_ID = 5,
  UNKNOWN = 6,
}

export interface CreateJob {
  name: string;
  timeout: number;
}

export type CreateJobInput = Partial<CreateJob>;
