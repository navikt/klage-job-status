import { cache } from 'react';
import { JOBS } from '@/lib/jobs';
import { LOGS } from '@/lib/logging';
import { authenticateFromHeaders } from '@/lib/user-token';

const log = {
  debug: (msg: string) => LOGS.debug(msg, 'rsc-get-namespaces'),
  info: (msg: string) => LOGS.info(msg, 'rsc-get-namespaces'),
  warn: (msg: string) => LOGS.warn(msg, 'rsc-get-namespaces'),
  error: (msg: string) => LOGS.error(msg, 'rsc-get-namespaces'),
};

/**
 * Fetches the namespace list for the current request, for use in Server Components (see
 * `components/NamespacesServer.tsx`). Calls `JOBS.getNamespaces` directly instead of going over
 * HTTP to `/api/namespaces`, since this already runs in the same server process.
 *
 * Wrapped in React's `cache()` so multiple Suspense boundaries reading it within the same
 * request share one Valkey `KEYS *` scan instead of triggering their own.
 */
export const getNamespacesForRequest = cache(async (): Promise<string[]> => {
  const [, authError] = await authenticateFromHeaders();

  if (authError !== null) {
    throw new Error(`Failed to authenticate request for namespaces: ${authError}`);
  }

  return JOBS.getNamespaces(log);
});
