import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
// `@action/run` pulls in `@action/input` transitively (via `@action/http`, `@action/poll`,
// `@action/handle-job`, ...) - see `action/test-env.ts`.
import './test-env';
import { runAction } from '@action/run';
import { mockProcessExit, ProcessExitError, resetProcessExitCode } from '@action/test-process-exit';
import { ExitCode } from '@actions/core';
import { type Job, Status } from '@common/common';

const JOB_URL = new URL('http://localhost/jobs/unit-test-job');

const runningJob: Job = {
  id: 'unit-test-job',
  namespace: 'unit-test-namespace',
  created: 1_000,
  modified: 1_000,
  timeout: 60,
  status: Status.RUNNING,
  ended: null,
};

/** A `text/event-stream` response whose body is exactly the given SSE chunks, then closes. */
const sseResponse = (status: number, ...chunks: string[]): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('runAction', () => {
  let exit: ReturnType<typeof mockProcessExit>;
  // Plain `mock()`s passed in as `fetchImpl`/`sleepImpl` (see `action/run.ts`) - not
  // `spyOn(globalThis, 'fetch')`/`spyOn(Bun, 'sleep')`, since Bun runs test files concurrently
  // by default and a global mock here would leak into whatever other file happens to run at the
  // same time (notably `action/action.test.ts`, which needs a real `fetch`).
  let fetchMock: ReturnType<typeof mock<typeof fetch>>;
  let sleep: ReturnType<typeof mock<(ms: number) => Promise<void>>>;

  beforeEach(() => {
    exit = mockProcessExit();
    fetchMock = mock();
    sleep = mock(() => Promise.resolve());
  });

  afterEach(() => {
    exit.mockRestore();
    resetProcessExitCode();
  });

  const run = (options: Omit<Parameters<typeof runAction>[0], 'fetchImpl' | 'sleepImpl'>) =>
    runAction({ ...options, fetchImpl: fetchMock, sleepImpl: sleep });

  test('uses SSE and returns once the stream closes for a still-running job', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(200, `event:created\ndata:${JSON.stringify(runningJob)}\n\n`));

    await run({ jobUrl: JOB_URL, apiKey: 'unit-test-namespace:read.sig', timeoutSeconds: 60 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  test('uses polling for a still-running job without erroring', async () => {
    // `@action/poll`'s own internal polling loop is bounded by `timeout` (see
    // `action/test-env.ts`, set to `0` for this exact reason) rather than anything `run.ts`
    // controls, so this only asserts the initial routing to polling, not repeated polls.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, runningJob));

    await run({ jobUrl: JOB_URL, apiKey: 'unit-test-namespace:read.sig', timeoutSeconds: 60 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  test('retries a 404 on the initial connection, then proceeds once the job appears', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(sseResponse(200, `event:created\ndata:${JSON.stringify(runningJob)}\n\n`));

    await run({
      jobUrl: JOB_URL,
      apiKey: 'unit-test-namespace:read.sig',
      timeoutSeconds: 60,
      initialConnectionRetryAttempts: 3,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  test('exits with failure once the initial connection retries are exhausted', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    const thrown = await run({
      jobUrl: JOB_URL,
      apiKey: 'unit-test-namespace:read.sig',
      timeoutSeconds: 60,
      initialConnectionRetryAttempts: 2,
    }).catch((e: unknown) => e);

    // Attempts 2, 1 and 0 each make one request before `checkStatus` finally sees the 404.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(thrown).toBeInstanceOf(ProcessExitError);
    expect((thrown as ProcessExitError).exitCode).toBe(ExitCode.Failure);
  });

  test('exits with failure once retries are exhausted after repeated fetch errors', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const thrown = await run({
      jobUrl: JOB_URL,
      apiKey: 'unit-test-namespace:read.sig',
      timeoutSeconds: 60,
      initialConnectionRetryAttempts: 2,
    }).catch((e: unknown) => e);

    // Attempts 2, 1 and 0 each make one request before giving up.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(thrown).toBeInstanceOf(ProcessExitError);
    expect((thrown as ProcessExitError).exitCode).toBe(ExitCode.Failure);
  });

  test('exits with failure for an unexpected content type', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 200, headers: { 'content-type': 'text/plain' } }));

    const thrown = await run({
      jobUrl: JOB_URL,
      apiKey: 'unit-test-namespace:read.sig',
      timeoutSeconds: 60,
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ProcessExitError);
    expect((thrown as ProcessExitError).exitCode).toBe(ExitCode.Failure);
  });
});
