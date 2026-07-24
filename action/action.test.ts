import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createGithubFiles, readGithubOutput, readGithubStepSummary, runAction } from '@action/run-child-process';
import { startTestServer } from '@action/test-server-client';
import { generateApiKey } from '@/lib/api-key/create';
import { AccessScope } from '@/lib/api-key/scope';

/**
 * Integration tests for the `action/` GitHub Action: spawns it as a real child process (`bun
 * action.ts`, exactly like `action.yaml` does), pointed at `action/test-server.ts` - itself
 * spawned as its own child process (see that file's docs for why), a plain `Bun.serve()`
 * dispatching straight to the real route handler functions from `app/jobs/[jobId]/route.ts` and
 * its `success`/`failed` sub-routes, backed by a real (throwaway, Dockerized) Valkey instance.
 *
 * Unlike `e2e/*.test.ts` (which exercise the dashboard UI through a real Next.js dev server and
 * a browser, via Playwright), these tests never need the actual Next.js server or a browser:
 * `action/action.ts` is a plain HTTP client, and API keys are generated directly with
 * `generateApiKey` (the same function the real `/api/namespaces/[namespace]/keys` route calls)
 * rather than fetched through the UI - hence a plain `bun:test` suite is enough.
 *
 * See `action/run.test.ts` for fast, mocked-`fetch` unit tests of the retry/reconnect/routing
 * logic itself - this suite instead covers the real CLI entry point end-to-end (env parsing,
 * real exit codes, real `GITHUB_OUTPUT`/`GITHUB_STEP_SUMMARY` files).
 *
 * A fresh server (and Valkey) per test, not once for the whole file via `beforeAll`/`afterAll`:
 * Bun's test runner kills any process it finds still running once it decides some boundary has
 * been crossed ("killed N dangling processes") - a single server shared across tests would get
 * caught by that. Starting/stopping - and fully awaiting the stop - within each individual
 * `test()` means it's never alive at a point where that could happen. See
 * `action/test-server-client.ts` for more.
 */

process.env.API_KEY_SECRET = 'action-test-secret';

let baseUrl: string;
let stopServer: () => Promise<void>;

beforeEach(async () => {
  console.error(`[test] beforeEach start ${new Date().toISOString()}`);
  const server = await startTestServer();
  console.error(`[test] beforeEach done ${new Date().toISOString()} baseUrl=${server.baseUrl}`);
  baseUrl = server.baseUrl;
  stopServer = server.stop;
}, 30_000);

afterEach(async () => {
  console.error(`[test] afterEach start ${new Date().toISOString()}`);
  await stopServer?.();
  console.error(`[test] afterEach done ${new Date().toISOString()}`);
});

const uniqueNamespace = (): string => `action-test-${crypto.randomUUID().replaceAll('-', '')}`;
const uniqueJobId = (): string => `job-${crypto.randomUUID()}`;

const apiKeys = (namespace: string) => {
  const [readKey] = generateApiKey(namespace, AccessScope.READ);
  const [writeKey] = generateApiKey(namespace, AccessScope.WRITE);

  if (readKey === null || writeKey === null) {
    throw new Error('Failed to generate API keys for test namespace');
  }

  return { readKey, writeKey };
};

/**
 * Every test below gets a generous timeout: this file runs concurrently alongside every other
 * `bun test` file, and under real CPU/Docker contention that can occasionally push a test past
 * the default 5000ms. That matters more here than in a typical test file - Bun kills any process
 * still running when a test times out (see https://github.com/oven-sh/bun/blob/main/test/cli/test/test-timeout-behavior.test.ts),
 * which would take out the `beforeAll`-spawned server (and thus every other test in this file)
 * along with whatever legitimately timed out.
 */
const TEST_TIMEOUT_MS = 20_000;

describe('action', () => {
  test(
    'reports success when a job succeeds while the action is connected via SSE',
    async () => {
      const namespace = uniqueNamespace();
      const jobId = uniqueJobId();
      const { readKey, writeKey } = apiKeys(namespace);

      console.error(`[test] before POST ${new Date().toISOString()}`);
      await fetch(`${baseUrl}/jobs/${jobId}`, {
        method: 'POST',
        headers: { API_KEY: writeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 60 }),
      });
      console.error(`[test] after POST ${new Date().toISOString()}`);

      const { githubOutput, githubStepSummary } = createGithubFiles();
      const action = runAction({ jobId, apiKey: readKey, baseUrl, githubOutput, githubStepSummary });

      await action.waitUntilConnected();
      await fetch(`${baseUrl}/jobs/${jobId}/success`, { method: 'PUT', headers: { API_KEY: writeKey } });

      const { code, output } = await action.result;

      expect(code).toBe(0);
      expect(output).toContain('succeeded');
      expect(readGithubOutput(githubOutput, 'status')).toBe('success');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'exits with failure when a job fails and fail=true (the default)',
    async () => {
      const namespace = uniqueNamespace();
      const jobId = uniqueJobId();
      const { readKey, writeKey } = apiKeys(namespace);

      await fetch(`${baseUrl}/jobs/${jobId}`, {
        method: 'POST',
        headers: { API_KEY: writeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 60 }),
      });

      const { githubOutput, githubStepSummary } = createGithubFiles();
      const action = runAction({ jobId, apiKey: readKey, baseUrl, fail: true, githubOutput, githubStepSummary });

      await action.waitUntilConnected();
      await fetch(`${baseUrl}/jobs/${jobId}/failed`, { method: 'PUT', headers: { API_KEY: writeKey } });

      const { code, output } = await action.result;

      expect(code).toBe(1);
      expect(output).toContain('failed');
      expect(readGithubOutput(githubOutput, 'status')).toBe('failed');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'exits with success when a job fails but fail=false (ignored)',
    async () => {
      const namespace = uniqueNamespace();
      const jobId = uniqueJobId();
      const { readKey, writeKey } = apiKeys(namespace);

      await fetch(`${baseUrl}/jobs/${jobId}`, {
        method: 'POST',
        headers: { API_KEY: writeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 60 }),
      });

      const { githubOutput, githubStepSummary } = createGithubFiles();
      const action = runAction({ jobId, apiKey: readKey, baseUrl, fail: false, githubOutput, githubStepSummary });

      await action.waitUntilConnected();
      await fetch(`${baseUrl}/jobs/${jobId}/failed`, { method: 'PUT', headers: { API_KEY: writeKey } });

      const { code } = await action.result;

      expect(code).toBe(0);
      expect(readGithubOutput(githubOutput, 'status')).toBe('success');
      expect(readGithubStepSummary(githubStepSummary)).toContain('ignored');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'uses polling instead of SSE when the job has already ended by the time it connects',
    async () => {
      const namespace = uniqueNamespace();
      const jobId = uniqueJobId();
      const { readKey, writeKey } = apiKeys(namespace);

      await fetch(`${baseUrl}/jobs/${jobId}`, {
        method: 'POST',
        headers: { API_KEY: writeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 60 }),
      });
      await fetch(`${baseUrl}/jobs/${jobId}/success`, { method: 'PUT', headers: { API_KEY: writeKey } });

      const { githubOutput, githubStepSummary } = createGithubFiles();
      const { result } = runAction({ jobId, apiKey: readKey, baseUrl, githubOutput, githubStepSummary });

      const { code, output } = await result;

      expect(code).toBe(0);
      expect(output).toContain('Using polling to get job status');
      expect(output).not.toContain('Using SSE to get job status');
      expect(readGithubOutput(githubOutput, 'status')).toBe('success');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'exits with failure for a job that never appears, when fail_on_unknown=true (the default)',
    async () => {
      const { readKey } = apiKeys(uniqueNamespace());

      const { githubOutput, githubStepSummary } = createGithubFiles();
      const { result } = runAction({
        jobId: uniqueJobId(),
        apiKey: readKey,
        baseUrl,
        failOnUnknown: true,
        // A real 404 is retried for a while in case the job is still being created elsewhere
        // (see `action/action.ts`) - shrink that to keep this test fast, since the job here
        // never exists.
        initialConnectionRetryAttempts: 1,
        githubOutput,
        githubStepSummary,
      });

      const { code, output } = await result;

      expect(code).toBe(1);
      expect(output).toContain('Not found');
      expect(readGithubOutput(githubOutput, 'status')).toBe('unknown');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'exits with success for a job that never appears, when fail_on_unknown=false',
    async () => {
      const { readKey } = apiKeys(uniqueNamespace());

      const { githubOutput, githubStepSummary } = createGithubFiles();
      const { result } = runAction({
        jobId: uniqueJobId(),
        apiKey: readKey,
        baseUrl,
        failOnUnknown: false,
        initialConnectionRetryAttempts: 1,
        githubOutput,
        githubStepSummary,
      });

      const { code, output } = await result;

      expect(code).toBe(0);
      expect(output).toContain('Not found');
      expect(readGithubOutput(githubOutput, 'status')).toBe('unknown');
    },
    TEST_TIMEOUT_MS,
  );
});
