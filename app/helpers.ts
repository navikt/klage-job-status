import type { JobParams } from '@app/types';

export const getJobId = (params: JobParams): string | null => {
  const { jobId, namespace } = params;

  if (namespace.length === 0 || jobId.length === 0) {
    return null;
  }

  return `${namespace}:${jobId}`;
};
