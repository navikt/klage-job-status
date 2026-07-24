import { JobsList } from '@/components/JobsList/JobsList';
import { JobsProvider } from '@/context/JobsContext';
import { getJobsForRequest } from '@/lib/jobs-server';

interface JobsServerProps {
  namespace: string;
}

/**
 * Awaits the initial job list server-side (see `lib/jobs-server.ts`) before rendering
 * `JobsList`, so `JobsProvider` always starts with real data instead of an empty list and a
 * client-side loading state.
 *
 * Rendered inside a `<Suspense>` boundary in `app/namespace/[namespace]/page.tsx`, so Next.js
 * streams a fallback immediately and swaps in this component's output once the (memoized)
 * Valkey lookup resolves. `JobsProvider` still opens its own SSE connection for live updates -
 * this only replaces the initial client-side fetch/loading state.
 */
export default async function JobsServer({ namespace }: JobsServerProps) {
  const initialJobs = await getJobsForRequest(namespace);

  return (
    <JobsProvider namespace={namespace} initialJobs={initialJobs}>
      <JobsList />
    </JobsProvider>
  );
}
