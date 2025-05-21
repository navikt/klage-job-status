import { type Job, JobEventType, isJob, isJobKey } from '@common/common';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface JobsContextType {
  jobs: Job[];
  isLoading: boolean;
  namespace: string;
  error: string | null;
}

const JobsContext = createContext<JobsContextType>({
  jobs: [],
  isLoading: false,
  namespace: '',
  error: null,
});

export const useJobs = () => useContext(JobsContext);

interface JobsProviderProps {
  namespace: string;
  children: React.ReactNode;
}

export const JobsProvider = ({ namespace, children }: JobsProviderProps) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onJobUpdated = useCallback((event: MessageEvent) => {
    const job: unknown = JSON.parse(event.data);

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
    const job: unknown = JSON.parse(event.data);

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
      setLoading(false);
    });

    return () => {
      sse.close();
    };
  }, [namespace, onJobUpdated, onJobDeleted]);

  return <JobsContext.Provider value={{ jobs, isLoading, error, namespace }}>{children}</JobsContext.Provider>;
};
