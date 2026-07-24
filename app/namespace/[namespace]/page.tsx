import { Suspense } from 'react';
import { JobsListFallback } from '@/components/JobsList/JobsListFallback';
import JobsServer from '@/components/JobsServer';

interface PageProps {
  params: Promise<{ namespace: string }>;
}

export default async function Page({ params }: PageProps) {
  const { namespace } = await params;

  return (
    <Suspense fallback={<JobsListFallback />}>
      <JobsServer namespace={namespace} />
    </Suspense>
  );
}
