'use client';

import { isJob, isJobKey, type Job, JobEventType } from '@common/common';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { parseJson } from '@/lib/json';

interface JobsContextType {
  jobs: Job[];
  namespace: string;
  error: string | null;
}

const JobsContext = createContext<JobsContextType>({
  jobs: [],
  namespace: '',
  error: null,
});

export const useJobs = () => useContext(JobsContext);

interface JobsProviderProps {
  namespace: string;
  /** Resolved server-side, streamed in via Suspense - see `components/JobsServer.tsx`. */
  initialJobs: Job[];
  children: React.ReactNode;
}

export const JobsProvider = ({ namespace, initialJobs, children }: JobsProviderProps) => {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [error, setError] = useState<string | null>(null);

  const onJobUpdated = useCallback((event: MessageEvent) => {
    const job = parseJson(event.data);

    if (!isJob(job)) {
      console.error('Invalid job data:', job);
      return;
    }

    setJobs((prevJobs) => {
      const jobIndex = prevJobs.findIndex(({ id, namespace }) => id === job.id && namespace === job.namespace);

      // If the job doesn't exist, add it to the list.
      if (jobIndex === -1) {
        return [...prevJobs, job].toSorted((a, b) => b.modified - a.modified);
      }

      // If the job exists, update it in the list.
      const updatedJobs = [...prevJobs];
      updatedJobs[jobIndex] = job;
      return updatedJobs.toSorted((a, b) => b.modified - a.modified);
    });
  }, []);

  const onJobDeleted = useCallback((event: MessageEvent) => {
    const job = parseJson(event.data);

    if (!isJobKey(job)) {
      console.error('Invalid job data:', job);
      return;
    }

    setJobs((prevJobs) => prevJobs.filter(({ id, namespace }) => id !== job.id || namespace !== job.namespace));
  }, []);

  useEffect(() => {
    const sse = new EventSource(`/api/jobs/${namespace}`);

    sse.addEventListener(JobEventType.CREATED, onJobUpdated);
    sse.addEventListener(JobEventType.UPDATED, onJobUpdated);
    sse.addEventListener(JobEventType.DELETED, onJobDeleted);

    sse.addEventListener('error', (event) => {
      console.error('SSE error:', event);
      setError('Error receiving job updates');
    });

    sse.addEventListener('open', () => {
      setError(null);
    });

    return () => {
      sse.close();
    };
  }, [namespace, onJobUpdated, onJobDeleted]);

  return <JobsContext.Provider value={{ jobs, error, namespace }}>{children}</JobsContext.Provider>;
};
