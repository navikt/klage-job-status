import { type JobKey, validateLength } from '@common/common';
import type { Context } from '@/lib/context';

export const validateJobKey = (log: Context, namespace: string, jobId: string): boolean => {
  if (namespace.length === 0 || jobId.length === 0) {
    log.debug(`Failed to create ID - Invalid job ID "${jobId}" or namespace "${namespace}"`);
    return false;
  }

  return true;
};

export const formatJobKey = ({ namespace, id }: JobKey): string => `${namespace}:${id}`;

export const JOB_ID_REGEX = /^[a-zA-Z0-9-_]+$/;
export const JOB_ID_MAX_LENGTH = 128;
export const JOB_ID_MIN_LENGTH = 1;

export const isValidJobId = (jobId: string): boolean => {
  if (!validateLength(jobId, JOB_ID_MIN_LENGTH, JOB_ID_MAX_LENGTH)) {
    return false;
  }

  return JOB_ID_REGEX.test(jobId);
};
