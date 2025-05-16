export interface JobParams {
  jobId: string;
  namespace: string;
}

export interface CreateJob {
  name: string;
  timeout: number;
}

export type CreateJobInput = Partial<CreateJob>;
