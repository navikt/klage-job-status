import { checkStatus } from '@action/http';
import { API_KEY, JOB_URL, TIMEOUT } from '@action/input';
import { formatJobName } from '@action/job-name';
import { poll } from '@action/poll';
import { sse } from '@action/sse';
import { ExitCode, error, info, warning } from '@actions/core';

const headers = new Headers({ API_KEY, accept: 'text/event-stream, application/json' });

const connectWithRetry = async (attempts: number): Promise<Response> => {
  info(`Connecting to job ${formatJobName()} (${attempts} attempts remaining) - ${JOB_URL}`);

  try {
    const response = await fetch(JOB_URL, { method: 'GET', headers, signal: AbortSignal.timeout(TIMEOUT * 1_000) });

    if (attempts > 0 && response.status === 404) {
      await Bun.sleep(1_000);

      return connectWithRetry(attempts - 1);
    }

    return response;
  } catch (e) {
    if (e instanceof Error) {
      error(e.message, { title: `${formatJobName()} - ${e.name}` });
    } else {
      error('Unknown error', { title: `${formatJobName()} - Unknown error` });
    }

    await Bun.sleep(1_000);

    return connectWithRetry(attempts - 1);
  }
};

const RECONNECT_ATTEMPTS = 30;

const getJobEvents = async (response: Response): Promise<void> => {
  await checkStatus(response);

  const contentType = response.headers.get('content-type')?.split(';')[0];

  if (contentType === 'text/event-stream') {
    info('Using SSE to get job status');

    try {
      await sse(response);
    } catch {
      warning('Error occurred while processing SSE stream, reconnecting...', {
        title: `${formatJobName()} - SSE Error`,
      });

      await getJobEvents(await connectWithRetry(RECONNECT_ATTEMPTS));
    }

    return;
  }

  if (contentType === 'application/json') {
    info('Using polling to get job status');
    try {
      await poll(response);
    } catch {
      warning('Error occurred while polling for job status, reconnecting...', {
        title: `${formatJobName()} - Polling Error`,
      });

      await getJobEvents(await connectWithRetry(RECONNECT_ATTEMPTS));
    }
    return;
  }

  error(contentType ?? 'undefined', { title: `${formatJobName()} - Unexpected content type` });
  process.exit(ExitCode.Failure);
};

// Initialize job status retrieval
const INITIAL_CONNECTION_RETRY_ATTEMPTS = 120;
await getJobEvents(await connectWithRetry(INITIAL_CONNECTION_RETRY_ATTEMPTS));
