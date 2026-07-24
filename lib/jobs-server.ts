import { isValidNamespace, type Job } from '@common/common';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { JOBS } from '@/lib/jobs';
import { LOGS } from '@/lib/logging';
import { withTraceDigest } from '@/lib/tracer';
import { authenticateFromHeaders } from '@/lib/user-token';

const log = {
  debug: (msg: string) => LOGS.debug(msg, 'rsc-get-jobs'),
  info: (msg: string) => LOGS.info(msg, 'rsc-get-jobs'),
  warn: (msg: string) => LOGS.warn(msg, 'rsc-get-jobs'),
  error: (msg: string) => LOGS.error(msg, 'rsc-get-jobs'),
};

/**
 * Fetches the initial job list for the current request, for use in Server Components (see
 * `components/JobsServer.tsx`). Calls `JOBS.getAll` directly instead of going over HTTP to
 * `/api/jobs/[namespace]`, since this already runs in the same server process. Live updates
 * still flow over that route's SSE stream, via `JobsContext`.
 *
 * Wrapped in React's `cache()` so multiple Suspense boundaries reading it within the same
 * request share one Valkey lookup instead of triggering their own.
 */
export const getJobsForRequest = cache(async (namespace: string): Promise<Job[]> => {
  if (!isValidNamespace(namespace)) {
    log.warn(`Invalid namespace "${namespace}"`);
    notFound();
  }

  const [, authError] = await authenticateFromHeaders();

  if (authError !== null) {
    log.error(`Failed to authenticate request for jobs in namespace "${namespace}": ${authError}`);
    throw withTraceDigest('Failed to authenticate request.');
  }

  return JOBS.getAll(log, namespace);
});
