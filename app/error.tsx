'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import type { ErrorBoundaryProps } from '@/lib/tracer';

/**
 * Root fallback for errors thrown below the root layout that aren't caught by a more specific,
 * segment-scoped `error.tsx` (e.g. `app/namespace/[namespace]/error.tsx`). See `ErrorAlert`
 * for the shared UI.
 *
 * Uses `retry` rather than `reset`, since `reset` only clears this boundary's local
 * state without re-fetching anything - it wouldn't actually retry the failed Server Component
 * render. `retry` also calls `router.refresh()` first, so the failed data fetch
 * genuinely runs again.
 */
export default function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ErrorAlert
      title="Something went wrong"
      description="Try again, or contact Team Klage if the problem persists."
      error={error}
      retry={retry}
    />
  );
}
