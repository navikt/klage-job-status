import { FAIL_ON_UNKNOWN, JOB_URL } from '@action/input';
import { formatJobName } from '@action/job-name';
import { ExitCode, error, notice, setFailed, setOutput } from '@actions/core';

export const checkStatus = async (res: Response) => {
  if (res.status === 404) {
    if (FAIL_ON_UNKNOWN) {
      error(`Job not found - Check ${JOB_URL} to see status.`, { title: `${formatJobName()} - Not found` });
      setOutput('status', 'unknown');
      setFailed('Job not found');
      process.exit(ExitCode.Failure);
    }

    notice(`Job not found - Check ${JOB_URL} to see status.`, { title: `${formatJobName()} - Not found (ignored)` });
    setOutput('status', 'unknown');
    process.exit(ExitCode.Success);
  }

  if (res.status !== 200) {
    error(`${res.status} - ${res.statusText}\n${await res.text()}`, {
      title: `${formatJobName()} - Unexpected HTTP status`,
    });
    process.exit(ExitCode.Failure);
  }
};
