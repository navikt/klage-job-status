import { StatusBadge } from '@app/components/StatusBadge';
import { DeleteJob } from '@app/components/job-card/DeleteJob';
import { JobDetail } from '@app/components/job-card/Detail';
import { Duration } from '@app/components/job-card/Duration';
import { isExpired } from '@app/components/job-card/expired';
import { formatDate, formatSeconds } from '@app/functions/format';
import type { Job } from '@common/common';
import { Status } from '@common/common';
import { Box, HStack, Heading } from '@navikt/ds-react';
import { type ComponentProps, type FC, useEffect, useState } from 'react';

interface JobCardProps {
  job: Job;
}

export const JobCard: FC<JobCardProps> = ({ job }) => {
  const status = useJobStatus(job);

  console.log('job.status', job.status);
  console.log('status', status);

  return (
    <Box.New
      as="li"
      background="default"
      width="100%"
      borderRadius="large"
      borderWidth="0 0 0 4"
      borderColor={STATUS_BORDER_COLOR.get(status)}
      padding="5"
      shadow="dialog"
      position="relative"
      overflow="hidden"
      className="hover:-translate-y-0.5 group text-left transition-[translate] duration-200 hover:bg-ax-bg-accent-moderate-a"
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
        <Duration key="duration" status={status} created={job.created} timeout={job.timeout} ended={job.ended} />
        <JobDetail label="Timeout">{formatSeconds(job.timeout)}</JobDetail>
      </div>

      <Box.New
        position="absolute"
        bottom="0"
        right="0"
        padding="2"
        className="opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        <DeleteJob jobId={job.id} namespace={job.namespace} />
      </Box.New>
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
      if (isExpired(job.created, job.timeout)) {
        clearInterval(interval);
        setStatus(Status.TIMEOUT);
        return;
      }
    }, 500);

    return () => clearInterval(interval);
  }, [job]);

  if (job.status !== Status.RUNNING) {
    return job.status;
  }

  return status;
};

const STATUS_BORDER_COLOR: Map<Status, ComponentProps<typeof Box.New>['borderColor']> = new Map([
  [Status.SUCCESS, 'success'],
  [Status.FAILED, 'danger'],
  [Status.RUNNING, 'info'],
]);
