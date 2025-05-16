import type { Job, Status } from '@common/common';
import { Box } from '@navikt/ds-react';

interface StatItemProps {
  jobs: Job[];
  status?: Status;
  children: React.ReactNode;
}

export const StatItem = ({ jobs, status, children }: StatItemProps) => (
  <Box.New
    background="default"
    borderRadius="medium"
    paddingInline="3"
    paddingBlock="4"
    shadow="dialog"
    className="min-w-25 grow text-center"
  >
    <span className="block font-bold text-2xl text-text-subtle">
      {status === undefined ? jobs.length : jobs.filter((job) => job.status === status).length}
    </span>

    <span className="text-small text-text-subtle">{children}</span>
  </Box.New>
);
