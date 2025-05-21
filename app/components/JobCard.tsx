import { StatusBadge } from '@app/components/StatusBadge';
import { formatDate, formatJobDuration, formatSeconds } from '@app/functions/format';
import type { Job } from '@common/common';
import { Status } from '@common/common';
import { Box, HStack, Heading } from '@navikt/ds-react';
import { type ComponentProps, type FC, useEffect, useState } from 'react';

interface JobCardProps {
  job: Job;
}

export const JobCard: FC<JobCardProps> = ({ job }) => {
  const status = useJobStatus(job);
  const duration = useJobDuration(job);

  return (
    <Box.New
      background="default"
      width="100%"
      borderRadius="large"
      borderWidth="0 0 0 4"
      borderColor={STATUS_BORDER_COLOR.get(status)}
      padding="5"
      shadow="dialog"
      className="hover:-translate-y-0.5 text-left transition-[translate] duration-200 hover:bg-ax-bg-accent-moderate-a"
    >
      <HStack marginBlock="0 3" align="center" justify="space-between">
        <Heading level="3" size="xsmall" className="font-normal text-text-subtle">
          {job.name ?? 'Unnamed Job'}
        </Heading>

        <StatusBadge {...job} status={status} />
      </HStack>

      <div className="mb-4 font-mono text-sm">ID: {job.id}</div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        <JobDetail label="Created">{formatDate(job.created)}</JobDetail>
        <JobDetail label={job.status === Status.RUNNING ? 'Updated' : 'Ended'}>
          {formatDate(job.ended ?? job.modified)}
        </JobDetail>
        <JobDetail label="Duration">{duration}</JobDetail>
        <JobDetail label="Timeout">{formatSeconds(job.timeout)}</JobDetail>
      </div>
    </Box.New>
  );
};

const useJobStatus = (job: Job) => {
  const [status, setStatus] = useState(job.status);

  useEffect(() => {
    if (job.status !== Status.RUNNING) {
      return;
    }

    const interval = setInterval(() => {
      if (job.created + job.timeout * 1000 < Date.now()) {
        clearInterval(interval);
        setStatus(Status.TIMEOUT);
        return;
      }
    }, 500);

    return () => clearInterval(interval);
  }, [job]);

  return status;
};

const useJobDuration = (job: Job) => {
  const [duration, setDuration] = useState(formatJobDuration(job));

  useEffect(() => {
    if (job.status !== Status.RUNNING) {
      return;
    }

    const interval = setInterval(() => {
      if (job.created + job.timeout * 1000 < Date.now()) {
        clearInterval(interval);
        return;
      }

      setDuration(formatJobDuration(job));
    }, 1_000);

    return () => clearInterval(interval);
  }, [job]);

  if (job.status === Status.TIMEOUT) {
    return formatSeconds(job.timeout);
  }

  return duration;
};

interface JobDetailProps {
  label: string;
  children: React.ReactNode;
}

const JobDetail = ({ label, children }: JobDetailProps) => (
  <section className="flex flex-col gap-1">
    <span className="font-bold text-small text-text-subtle">{label}:</span>
    <span className="text-small text-text-default">{children}</span>
  </section>
);

const STATUS_BORDER_COLOR: Map<Status, ComponentProps<typeof Box.New>['borderColor']> = new Map([
  [Status.SUCCESS, 'success'],
  [Status.FAILED, 'danger'],
  [Status.RUNNING, 'info'],
]);
