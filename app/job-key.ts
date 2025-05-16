export const getJobKey = (namespace: string, jobId: string): string | null => {
  if (namespace.length === 0 || jobId.length === 0) {
    console.debug(`Failed to create ID - Invalid job ID "${jobId}" or namespace "${namespace}"`);
    return null;
  }

  return `${namespace}:${jobId}`;
};
