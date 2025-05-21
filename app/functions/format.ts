import type { Job } from '@common/common';
import { type Duration, format, intervalToDuration } from 'date-fns';

export const formatDate = (timestamp: number | null) => {
  if (timestamp === null) {
    return 'N/A';
  }

  return format(timestamp, 'dd.MM.yyyy HH:mm:ss');
};

export const formatJobDuration = ({ created, ended }: Pick<Job, 'created' | 'ended'>) =>
  formatDuration(intervalToDuration({ start: created, end: ended ?? Date.now() }));

export const formatSeconds = (duration: number) =>
  formatDuration(intervalToDuration({ start: 0, end: duration * 1000 }));

export const formatDuration = (duration: Duration) => {
  const { years, months, weeks, days, hours, minutes, seconds } = duration;

  const segments = [years, months, weeks, days, hours, minutes, seconds];

  return segments
    .filter((n, i) => i > 3 || n !== undefined) // Only include segments that have a value. Always include hours, minutes, seconds
    .map(f)
    .join(':');
};

const f = (number = 0) => number.toString().padStart(2, '0');
