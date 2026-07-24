import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
// `@action/http` reads `FAIL_ON_UNKNOWN`/`JOB_URL` from `@action/input` at import time - see
// `action/test-env.ts`. This test suite runs with the same fixed env as `action/handle-job.test.ts`:
// `FAIL_ON_UNKNOWN=true` (`action.yaml`'s default). The `FAIL_ON_UNKNOWN=false` ("ignore unknown
// jobs") branch is instead covered by `e2e/action.test.ts`, which spawns a real process per test
// and so can vary env vars freely.
import './test-env';
import { checkStatus } from '@action/http';
import { mockProcessExit, ProcessExitError, resetProcessExitCode } from '@action/test-process-exit';
import { ExitCode } from '@actions/core';

const jsonResponse = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('checkStatus', () => {
  let exit: ReturnType<typeof mockProcessExit>;

  beforeEach(() => {
    exit = mockProcessExit();
  });

  afterEach(() => {
    exit.mockRestore();
    resetProcessExitCode();
  });

  test('resolves without exiting for a 200 response', async () => {
    await expect(checkStatus(jsonResponse(200, { status: 'RUNNING' }))).resolves.toBeUndefined();

    expect(exit).not.toHaveBeenCalled();
  });

  test('exits with failure for a 404 response (FAIL_ON_UNKNOWN=true)', async () => {
    const thrown = await checkStatus(jsonResponse(404)).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ProcessExitError);
    expect((thrown as ProcessExitError).exitCode).toBe(ExitCode.Failure);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  test('exits with failure for a non-200, non-404 response', async () => {
    const thrown = await checkStatus(jsonResponse(500, { message: 'boom' })).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ProcessExitError);
    expect((thrown as ProcessExitError).exitCode).toBe(ExitCode.Failure);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
