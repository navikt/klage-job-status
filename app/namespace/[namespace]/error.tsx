'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import type { ErrorBoundaryProps } from '@/lib/tracer';

/**
 * Scoped to the `/namespace/[namespace]` segment, so it only catches errors thrown while
 * loading jobs for a namespace - notably `lib/jobs-server.ts#getJobsForRequest` on an auth
 * failure (an invalid namespace is handled separately via `notFound()`, not a thrown error).
 * See `ErrorAlert` for the shared UI.
 *
 * Uses `retry` rather than `reset`, since `reset` only clears this boundary's local
 * state without re-fetching anything - it wouldn't actually retry the failed Server Component
 * render. `retry` also calls `router.refresh()` first, so the failed data fetch
 * genuinely runs again.
 */
export default function NamespaceError({ error, retry }: ErrorBoundaryProps) {
  return (
    <ErrorAlert
      title="Couldn't load jobs for this namespace"
      description="Try again, or contact Team Klage if the problem persists."
      error={error}
      retry={retry}
    />
  );
}
