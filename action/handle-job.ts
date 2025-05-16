import { JOB_URL } from '@action/input';
import { formatJobName } from '@action/job-name';
import { ExitCode, info, setOutput, summary } from '@actions/core';
import { type Job, Status } from '@common/common';
import { formatDuration, intervalToDuration } from 'date-fns';

export const handleJob = (job: Job) => {
  const duration = intervalToDuration({ start: job.created, end: job.ended ?? Date.now() });
  const formattedRuntime = formatDuration(duration);

  info(`${formatJobName(job)} has status ${job.status} after ${formattedRuntime}`);

  summary.addRaw(`Runtime: ${formattedRuntime}`);
  summary.addLink('See status at', JOB_URL);

  if (job.status === Status.SUCCESS) {
    setOutput('status', 'success');
    summary.addHeading(`${formatJobName(job)} succeeded`);
    summary.write({ overwrite: true });
    process.exit(ExitCode.Success);
  }

  if (job.status === Status.FAILED) {
    setOutput('status', 'failed');
    summary.addHeading(`${formatJobName(job)} failed`);
    summary.write({ overwrite: true });
    process.exit(ExitCode.Failure);
  }
};
