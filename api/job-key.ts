import type { JobKey } from '@common/common';

export const validateJobKey = (namespace: string, jobId: string): boolean => {
  if (namespace.length === 0 || jobId.length === 0) {
    console.debug(`Failed to create ID - Invalid job ID "${jobId}" or namespace "${namespace}"`);
    return false;
  }

  return true;
};

export const formatJobKey = ({ namespace, id }: JobKey): string => `${namespace}:${id}`;
