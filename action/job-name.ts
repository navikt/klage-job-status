import { JOB_ID, NAMESPACE } from '@action/input';
import type { Job } from '@common/common';

export const formatJobName = (job?: Job): string =>
  job?.name === undefined
    ? `Job "${JOB_ID}" in namespace "${NAMESPACE}"`
    : `Job "${job.name}" (${JOB_ID}) in namespace "${NAMESPACE}"`;
