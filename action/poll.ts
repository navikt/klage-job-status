import { handleJob } from '@action/handle-job';
import { checkStatus } from '@action/http';
import { JOB_URL, TIMEOUT } from '@action/input';
import { formatJobName } from '@action/job-name';
import { ExitCode, error } from '@actions/core';
import { isJob } from '@common/common';

export const poll = async (response: Response, headers: Headers) => {
  const job = await response.json();

  if (!isJob(job)) {
    error(`Unexpected response:\n${JSON.stringify(job)}`);
    process.exit(ExitCode.Failure);
  }

  handleJob(job); // This will exit the process if the job is not running.

  // If the job is still running, we need to poll for updates. SSE was not offered by the server.
  const ended = Date.now() + TIMEOUT * 1_000;

  while (Date.now() < ended) {
    const res = await fetch(JOB_URL, { method: 'GET', headers });

    await checkStatus(res);

    const job = await res.json();

    if (!isJob(job)) {
      error(JSON.stringify(job), { title: `${formatJobName()} - Unexpected response` });
      process.exit(ExitCode.Failure);
    }

    handleJob(job);

    await Bun.sleep(1_000);
  }
};
