import { checkStatus } from '@action/http';
import { formatJobName } from '@action/job-name';
import { poll } from '@action/poll';
import { sse } from '@action/sse';
import { ExitCode, error, info, warning } from '@actions/core';

/** Just the callable shape of `fetch` - `typeof fetch` itself also requires a `preconnect` static, which a plain mock function won't have. */
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RunActionOptions {
  jobUrl: URL;
  apiKey: string;
  timeoutSeconds: number;
  /** Retries on the very first connection, in case the job doesn't exist *yet* (e.g. it's still being created elsewhere). Default: 120. */
  initialConnectionRetryAttempts?: number;
  /** Retries when an established SSE/polling connection drops mid-stream. Default: 30. */
  reconnectAttempts?: number;
  /**
   * Defaults to the real `fetch`/`Bun.sleep` - overridden by `action/run.test.ts` so it can test
   * the retry/reconnect logic without mocking either as a *global*. Bun runs test files
   * concurrently by default, and a global mock (`spyOn(globalThis, 'fetch')`) would leak into
   * whatever other test file happens to be running at the same time - notably
   * `action/action.test.ts`, which needs a real `fetch`.
   */
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Connects to `jobUrl` and reports job status updates (via `@action/handle-job`, through
 * `@action/sse`/`@action/poll`) until the job ends - `checkStatus`/`handleJob` are what actually
 * `process.exit()` once that happens, this function otherwise runs until then.
 *
 * Extracted out of `action/action.ts` (the CLI entry point, which just wires this up to real env
 * vars via `@action/input`) so it can be called directly - with a stubbed `fetchImpl` and small
 * retry counts - from `action/run.test.ts`, instead of only being exercisable by spawning a whole
 * `bun action.ts` child process (see `action/action.test.ts` for that).
 */
export const runAction = async ({
  jobUrl,
  apiKey,
  timeoutSeconds,
  initialConnectionRetryAttempts = 120,
  reconnectAttempts = 30,
  fetchImpl = fetch,
  sleepImpl = Bun.sleep,
}: RunActionOptions): Promise<void> => {
  const headers = new Headers({ API_KEY: apiKey, accept: 'text/event-stream, application/json' });

  const connectWithRetry = async (attempts: number): Promise<Response> => {
    info(`Connecting to job ${formatJobName()} (${attempts} attempts remaining) - ${jobUrl}`);

    try {
      const response = await fetchImpl(jobUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(timeoutSeconds * 1_000),
      });

      if (attempts > 0 && response.status === 404) {
        await sleepImpl(1_000);

        return connectWithRetry(attempts - 1);
      }

      return response;
    } catch (e) {
      if (e instanceof Error) {
        error(e.message, { title: `${formatJobName()} - ${e.name}` });
      } else {
        error('Unknown error', { title: `${formatJobName()} - Unknown error` });
      }

      if (attempts <= 0) {
        error(`Ran out of retry attempts connecting to ${jobUrl}`, {
          title: `${formatJobName()} - Connection failed`,
        });
        process.exit(ExitCode.Failure);
      }

      await sleepImpl(1_000);

      return connectWithRetry(attempts - 1);
    }
  };

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

        await getJobEvents(await connectWithRetry(reconnectAttempts));
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

        await getJobEvents(await connectWithRetry(reconnectAttempts));
      }
      return;
    }

    error(contentType ?? 'undefined', { title: `${formatJobName()} - Unexpected content type` });
    process.exit(ExitCode.Failure);
  };

  await getJobEvents(await connectWithRetry(initialConnectionRetryAttempts));
};
