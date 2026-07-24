import { API_KEY, JOB_URL, TIMEOUT } from '@action/input';
import { runAction } from '@action/run';

/**
 * `run.ts`'s own attempt-count defaults (120/30) are what's actually used in production - this
 * override only exists so `e2e/action.test.ts` can shrink them to keep its "job never appears"
 * tests fast, by spawning this file as a real child process with these env vars set. Everything
 * else about `runAction`'s behavior (retry logic, SSE-vs-polling routing, ...) is instead unit
 * tested directly in `action/run.test.ts`, without needing a real process at all.
 */
const getAttemptsOverride = (name: string): number | undefined => {
  const raw = process.env[name];

  if (raw === undefined || raw.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed;
};

// Initialize job status retrieval - see `action/run.ts` for the actual logic.
await runAction({
  jobUrl: JOB_URL,
  apiKey: API_KEY,
  timeoutSeconds: TIMEOUT,
  initialConnectionRetryAttempts: getAttemptsOverride('INITIAL_CONNECTION_RETRY_ATTEMPTS'),
  reconnectAttempts: getAttemptsOverride('RECONNECT_ATTEMPTS'),
});
