import { handleJob } from '@action/handle-job';
import { checkStatus } from '@action/http';
import { API_KEY, JOB_URL, TIMEOUT } from '@action/input';
import { formatJobName } from '@action/job-name';
import { ExitCode, error } from '@actions/core';
import { isJob } from '@common/common';

const headers = new Headers({ API_KEY, accept: 'application/json' });

export const poll = async (response: Response) => {
  const job = await response.json();

  if (isJob(job)) {
    await handleJob(job); // This will exit the process if the job is not running.
  } else {
    error(`Unexpected response:\n${JSON.stringify(job)}`);
  }

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
