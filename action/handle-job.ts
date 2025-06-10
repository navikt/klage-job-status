import { BASE_URL, FAIL, FAIL_ON_UNKNOWN, IS_GITHUB_ACTION } from '@action/input';
import { formatJobName } from '@action/job-name';
import { ExitCode, info, setFailed, setOutput, summary } from '@actions/core';
import type { SummaryTableCell } from '@actions/core/lib/summary';
import { type Job, Status } from '@common/common';
import { format, formatDuration, intervalToDuration } from 'date-fns';

export const handleJob = async (job: Job) => {
  const duration = intervalToDuration({ start: job.created, end: job.ended ?? Date.now() });
  const formattedRuntime = formatDuration(duration);

  info(`${formatJobName(job)} has status ${job.status} after ${formattedRuntime}`);

  summary.addSeparator();

  let exitCode: ExitCode = ExitCode.Failure;

  switch (job.status) {
    case Status.SUCCESS: {
      setOutput('status', 'success');
      exitCode = ExitCode.Success;
      summary.addHeading(`Job "${name(job.name)}" succeeded`, 2);
      break;
    }

    case Status.FAILED: {
      if (FAIL) {
        setOutput('status', 'failed');
        exitCode = ExitCode.Failure;
        summary.addHeading(`Job "${name(job.name)}" failed`, 2);
        setFailed('Job has failed');
      } else {
        setOutput('status', 'success');
        exitCode = ExitCode.Success;
        summary.addHeading(`Job "${name(job.name)}" failed (ignored)`, 2);
        summary.addDetails(
          'Failed job ignored',
          'This job failed but will not cause the action to fail because the FAIL environment variable is set to false.',
        );
      }
      break;
    }

    case Status.TIMEOUT: {
      if (FAIL) {
        setOutput('status', 'timeout');
        exitCode = ExitCode.Failure;
        summary.addHeading(`Job "${name(job.name)}" timed out`, 2);
        setFailed('Job has timed out');
      } else {
        setOutput('status', 'success');
        exitCode = ExitCode.Success;
        summary.addHeading(`Job "${name(job.name)}" timed out (ignored)`, 2);
        summary.addDetails(
          'Timed out job ignored',
          'This job timed out but will not cause the action to fail because the FAIL environment variable is set to false.',
        );
      }
      break;
    }

    case Status.RUNNING: {
      setOutput('status', FAIL_ON_UNKNOWN ? 'failed' : 'success');
      exitCode = FAIL_ON_UNKNOWN ? ExitCode.Failure : ExitCode.Success;
      summary.addHeading(`Job "${name(job.name)}" is running`, 2);
      break;
    }
  }

  summary.addTable([
    [h('Job Name'), name(job.name)],
    [h('Status'), job.status],
    [h('Runtime'), formattedRuntime],
    [h('Job ID'), job.id],
    [h('Namespace'), job.namespace],
    [h('Timeout'), formatDuration(intervalToDuration({ start: 0, end: job.timeout * 1000 }))],
    [h('Job URL'), `${BASE_URL}/jobs/${job.id}`],
    [h('Created'), format(job.created, 'dd.MM.yyyy HH:mm:ss')],
    [h('Modified'), format(job.modified, 'dd.MM.yyyy HH:mm:ss')],
    [h('Ended'), job.ended ? format(job.ended, 'dd.MM.yyyy HH:mm:ss') : 'Still running'],
  ]);

  const params = new URLSearchParams();
  params.set('namespace', job.namespace);
  params.set('status', job.status);

  if (job.name !== undefined) {
    params.set('name', encodeURIComponent(job.name));
  }

  summary.addLink('See job status', `${BASE_URL}?${params.toString()}`);

  if (IS_GITHUB_ACTION) {
    await summary.write();
  } else {
    console.info(summary.stringify());
  }

  process.exit(exitCode ?? ExitCode.Success);
};

const name = (name: string | undefined): string => (name === undefined ? '<Unnamed>' : name);

const h = (header: string): SummaryTableCell => ({ data: header, header: true });
