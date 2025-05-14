import { JOB_URL } from '@action/input';
import { formatJobName } from '@action/job-name';
import { ExitCode, error, info, notice, setOutput } from '@actions/core';
import { type Job, Status } from '@common/common';
import { formatDuration, intervalToDuration } from 'date-fns';

export const handleJob = (job: Job) => {
  const duration = intervalToDuration({ start: job.created, end: job.ended ?? Date.now() });
  const formattedRuntime = formatDuration(duration);

  info(`${formatJobName(job)} has status ${job.status} after ${formattedRuntime}`);

  if (job.status === Status.SUCCESS) {
    setOutput('status', 'success');
    notice(`Runtime: ${formattedRuntime}.\nSee status at ${JOB_URL}`, { title: `${formatJobName(job)} succeeded` });
    process.exit(ExitCode.Success);
  }

  if (job.status === Status.FAILED) {
    setOutput('status', 'failed');
    error(`Runtime: ${formattedRuntime}.\nSee status at ${JOB_URL}`, { title: `${formatJobName(job)} failed` });
    process.exit(ExitCode.Failure);
  }
};
