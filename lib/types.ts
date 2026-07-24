interface CreateJob {
  name: string;
  timeout: number;
}

export type CreateJobInput = Partial<CreateJob>;

export const isCreateJobInput = (data: unknown): data is CreateJobInput => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  if ('name' in data && typeof data.name !== 'string') {
    return false;
  }

  if ('timeout' in data && typeof data.timeout !== 'number') {
    return false;
  }

  return true;
};
