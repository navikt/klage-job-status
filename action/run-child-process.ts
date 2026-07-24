import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ACTION_ENTRY = new URL('./action.ts', import.meta.url).pathname;

export interface RunActionOptions {
  jobId: string;
  apiKey: string;
  baseUrl: string;
  fail?: boolean;
  failOnUnknown?: boolean;
  /** Overrides `action.ts`'s initial-connection retry count (see `action/action.ts`) to keep the "job never appears" tests fast. */
  initialConnectionRetryAttempts?: number;
  githubOutput: string;
  githubStepSummary: string;
}

export interface ActionRun {
  /** Resolves once the action process exits. */
  result: Promise<{ code: number; output: string }>;
  /**
   * Resolves once the action logs that it's waiting for SSE events, i.e. once it has received
   * the SSE response headers and (per `app/jobs/[jobId]/route.ts`) subscribed to job updates.
   * Callers should await this before triggering a job status change, otherwise the update could
   * be published before the action has subscribed to it and would never be seen.
   */
  waitUntilConnected: () => Promise<void>;
}

/**
 * Spawns `action/action.ts` as a real child process, the same way `action.yaml` does (`bun
 * action.ts`), against `action/test-server.ts`. Each invocation gets its own process and
 * environment, so - unlike the mocked-`fetch` unit tests in `action/run.test.ts` - this can
 * freely exercise every combination of `FAIL`/`FAIL_ON_UNKNOWN`, and verifies the real CLI entry
 * point (`@action/input`'s env parsing, real exit codes, real `GITHUB_OUTPUT`/
 * `GITHUB_STEP_SUMMARY` file writes) end-to-end.
 */
export const runAction = ({
  jobId,
  apiKey,
  baseUrl,
  fail = true,
  failOnUnknown = true,
  initialConnectionRetryAttempts,
  githubOutput,
  githubStepSummary,
}: RunActionOptions): ActionRun => {
  // Omit `timeout`: `action/test-env.ts` sets it to `'0'` process-wide (shared across all
  // `bun test` files), which would otherwise leak into the child and abort its connection
  // instantly (see `@action/input`'s `getTimeout()`).
  const { timeout: _timeout, ...env } = process.env;

  const child = Bun.spawn(['bun', ACTION_ENTRY], {
    env: {
      ...env,
      GITHUB_ACTIONS: 'true',
      JOB_ID: jobId,
      API_KEY: apiKey,
      ACTION_TEST_BASE_URL: baseUrl,
      FAIL: fail ? 'true' : 'false',
      FAIL_ON_UNKNOWN: failOnUnknown ? 'true' : 'false',
      GITHUB_OUTPUT: githubOutput,
      GITHUB_STEP_SUMMARY: githubStepSummary,
      ...(initialConnectionRetryAttempts === undefined
        ? {}
        : { INITIAL_CONNECTION_RETRY_ATTEMPTS: `${initialConnectionRetryAttempts}` }),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let output = '';
  let resolveConnected: (() => void) | undefined;
  const connected = new Promise<void>((resolve) => {
    resolveConnected = resolve;
  });

  const pump = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
    const decoder = new TextDecoder();

    for await (const chunk of stream) {
      output += decoder.decode(chunk);

      if (resolveConnected !== undefined && output.includes('Waiting for SSE events...')) {
        resolveConnected();
        resolveConnected = undefined;
      }
    }
  };

  const result = Promise.all([pump(child.stdout), pump(child.stderr), child.exited]).then(([, , code]) => ({
    code,
    output,
  }));

  return { result, waitUntilConnected: () => connected };
};

/**
 * Creates the `GITHUB_OUTPUT`/`GITHUB_STEP_SUMMARY` files `@actions/core` needs (it opens them
 * for appending rather than creating them - see `action/test-env.ts` for the unit test
 * equivalent), scoped to their own temp directory per call so parallel tests never collide.
 */
export const createGithubFiles = (): { githubOutput: string; githubStepSummary: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'klage-job-status-action-test-server-'));
  const githubOutput = join(dir, 'output');
  const githubStepSummary = join(dir, 'summary.md');

  writeFileSync(githubOutput, '');
  writeFileSync(githubStepSummary, '');

  return { githubOutput, githubStepSummary };
};

/** Reads the value written for a `setOutput(name, ...)` call to a `GITHUB_OUTPUT` file. */
export const readGithubOutput = (githubOutput: string, name: string): string | undefined => {
  const content = readFileSync(githubOutput, 'utf-8');
  const match = content.match(new RegExp(`^${name}<<(ghadelimiter_[\\w-]+)\\n([\\s\\S]*?)\\n\\1$`, 'm'));

  return match?.[2];
};

/**
 * Reads the job summary `handleJob` writes via `summary.write()` (see `action/handle-job.ts`) -
 * `GITHUB_ACTIONS=true` (set for every run here, matching real usage) always takes that branch
 * over logging the summary to stdout, so assertions on the summary's content must read this file
 * rather than the process's captured output.
 */
export const readGithubStepSummary = (githubStepSummary: string): string => readFileSync(githubStepSummary, 'utf-8');
