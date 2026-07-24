'use client';

import { Status } from '@common/common';
import { memo, useEffect, useState } from 'react';
import { JobDetail } from '@/components/job-card/Detail';
import { isExpired } from '@/components/job-card/expired';
import { formatJobDuration, formatSeconds } from '@/functions/format';

interface DurationProps {
  created: number;
  timeout: number;
  ended: number | null;
  status: Status;
}

export const Duration = memo(
  ({ created, timeout, ended, status }: DurationProps) => {
    const duration = useJobDuration(created, timeout, ended, status);

    return (
      <JobDetail label="Duration" suppressHydrationWarning>
        {duration}
      </JobDetail>
    );
  },
  (p, n) => p.created === n.created && p.status === n.status && p.ended === n.ended && p.timeout === n.timeout,
);

const useJobDuration = (created: number, timeout: number, ended: number | null, status: Status) => {
  const [duration, setDuration] = useState(formatJobDuration({ created, ended }));

  useEffect(() => {
    if (status !== Status.RUNNING) {
      return;
    }

    const interval = setInterval(() => {
      if (isExpired(created, timeout)) {
        clearInterval(interval);
        return;
      }

      setDuration(formatJobDuration({ created, ended }));
    }, 1_000);

    return () => clearInterval(interval);
  }, [created, ended, timeout, status]);

  if (status === Status.TIMEOUT) {
    return formatSeconds(timeout);
  }

  return duration;
};
