import { checkStatus } from '@action/http';
import { API_KEY, JOB_URL, TIMEOUT } from '@action/input';
import { formatJobName } from '@action/job-name';
import { poll } from '@action/poll';
import { sse } from '@action/sse';
import { ExitCode, error } from '@actions/core';

const MAX_ATTEMPTS = 30;

const headers = new Headers({ API_KEY, accept: 'text/event-stream, application/json' });

const getJob = async (attempt = 0): Promise<Response> => {
  const response = await fetch(JOB_URL, { method: 'GET', headers, signal: AbortSignal.timeout(TIMEOUT * 1_000) });

  if (attempt < MAX_ATTEMPTS && response.status === 404) {
    await Bun.sleep(1_000);

    return getJob(attempt + 1);
  }

  return response;
};

const response = await getJob();

await checkStatus(response);

const contentType = response.headers.get('content-type')?.split(';')[0];

if (contentType === 'application/json') {
  await poll(response, headers);
} else if (contentType === 'text/event-stream') {
  await sse(response);
} else {
  error(contentType ?? 'undefined', { title: `${formatJobName()} - Unexpected content type` });
  process.exit(ExitCode.Failure);
}
