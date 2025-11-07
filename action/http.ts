import { formatJobName } from '@action/job-name';
import { ExitCode, error } from '@actions/core';

export const checkStatus = async (res: Response) => {
  if (res.status === 404) {
    error(`Job not found - Check ${URL} to see status.`, { title: `${formatJobName()} - Not found` });
    process.exit(ExitCode.Failure);
  }

  if (res.status !== 200) {
    error(`${res.status} - ${res.statusText}\n${await res.text()}`, {
      title: `${formatJobName()} - Unexpected HTTP status`,
    });
    process.exit(ExitCode.Failure);
  }
};
