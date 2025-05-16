import { type Job, Status } from '@common/common';
import { Box, type BoxNewProps } from '@navikt/ds-react';

export const StatusBadge = ({ status }: Pick<Job, 'status'>) => (
  <Box.New
    as="span"
    borderRadius="medium"
    background={BACKGROUND_COLOR[status]}
    className={`rounded-medium px-2 py-1 font-bold text-[12px] uppercase ${TEXT_COLOR[status]}`}
  >
    {status}
  </Box.New>
);

const BACKGROUND_COLOR: Record<Status, BoxNewProps['background']> = {
  [Status.SUCCESS]: 'success-moderate',
  [Status.FAILED]: 'danger-moderate',
  [Status.RUNNING]: 'info-moderate',
  [Status.TIMEOUT]: 'neutral-moderate',
};

const STATUS_BADGE_SUCCESS_CLASSES = 'text-icon-success';
const STATUS_BADGE_FAILED_CLASSES = 'text-icon-danger';
const STATUS_BADGE_RUNNING_CLASSES = 'text-icon-info';
const STATUS_BADGE_TIMEOUT_CLASSES = 'text-icon-warning';

const TEXT_COLOR: Record<Status, string> = {
  [Status.SUCCESS]: STATUS_BADGE_SUCCESS_CLASSES,
  [Status.FAILED]: STATUS_BADGE_FAILED_CLASSES,
  [Status.RUNNING]: STATUS_BADGE_RUNNING_CLASSES,
  [Status.TIMEOUT]: STATUS_BADGE_TIMEOUT_CLASSES,
};
