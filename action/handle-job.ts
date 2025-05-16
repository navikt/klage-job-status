import { IS_GITHUB_ACTION, JOB_URL } from '@action/input';
import { formatJobName } from '@action/job-name';
import { ExitCode, info, setOutput, summary } from '@actions/core';
import { type Job, Status } from '@common/common';
import { formatDuration, intervalToDuration } from 'date-fns';

export const handleJob = async (job: Job) => {
  const duration = intervalToDuration({ start: job.created, end: job.ended ?? Date.now() });
  const formattedRuntime = formatDuration(duration);

  info(`${formatJobName(job)} has status ${job.status} after ${formattedRuntime}`);

  summary.addDetails('Runtime', formattedRuntime);
  summary.addLink('See status at', JOB_URL);

  if (job.status === Status.SUCCESS) {
    setOutput('status', 'success');
    summary.addHeading(`${formatJobName(job)} succeeded`);

    if (IS_GITHUB_ACTION) {
      await summary.write();
    } else {
      console.info(summary.stringify());
    }

    process.exit(ExitCode.Success);
  }

  if (job.status === Status.FAILED) {
    setOutput('status', 'failed');
    summary.addHeading(`${formatJobName(job)} failed`);

    if (IS_GITHUB_ACTION) {
      await summary.write();
    } else {
      console.info(summary.stringify());
    }

    process.exit(ExitCode.Failure);
  }
};
