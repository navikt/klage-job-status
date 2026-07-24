import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
// `@action/handle-job` reads `FAIL`/`BASE_URL`/`IS_GITHUB_ACTION` from `@action/input` at import
// time - see `action/test-env.ts`. This suite runs with the same fixed env as
// `action/http.test.ts`: `FAIL=true`, `GITHUB_ACTIONS=true` (`action.yaml`'s defaults). The
// `FAIL=false` ("ignore failed/timed out jobs") branch is instead covered by
// `e2e/action.test.ts`, which spawns a real process per test and so can vary env vars freely.
import './test-env';
import { handleJob } from '@action/handle-job';
import { mockProcessExit, ProcessExitError, resetProcessExitCode } from '@action/test-process-exit';
import { ExitCode } from '@actions/core';
import { Status } from '@common/common';

const BASE_JOB = {
  id: 'job-1',
  namespace: 'klage',
  name: 'My job',
  created: 1_000,
  modified: 1_000,
  timeout: 60,
};

const runningJob = () => ({ ...BASE_JOB, status: Status.RUNNING, ended: null }) as const;
const endedJob = (status: Status.SUCCESS | Status.FAILED | Status.TIMEOUT) =>
  ({ ...BASE_JOB, status, ended: 2_000 }) as const;

/** The `status` output written via `GITHUB_OUTPUT` (see `action/test-env.ts`). */
const lastOutput = (): string => readFileSync(process.env.GITHUB_OUTPUT as string, 'utf-8');

describe('handleJob', () => {
  let exit: ReturnType<typeof mockProcessExit>;

  beforeEach(() => {
    exit = mockProcessExit();
  });

  afterEach(() => {
    exit.mockRestore();
    resetProcessExitCode();
  });

  test('does not exit while the job is still running', async () => {
    await handleJob(runningJob());

    expect(exit).not.toHaveBeenCalled();
  });

  test('exits successfully when the job succeeds', async () => {
    const thrown = await handleJob(endedJob(Status.SUCCESS)).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ProcessExitError);
    expect((thrown as ProcessExitError).exitCode).toBe(ExitCode.Success);
    expect(lastOutput()).toContain('success');
  });

  test('exits with failure when the job fails (FAIL=true)', async () => {
    const thrown = await handleJob(endedJob(Status.FAILED)).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ProcessExitError);
    expect((thrown as ProcessExitError).exitCode).toBe(ExitCode.Failure);
    expect(lastOutput()).toContain('failed');
  });

  test('exits with failure when the job times out (FAIL=true)', async () => {
    const thrown = await handleJob(endedJob(Status.TIMEOUT)).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ProcessExitError);
    expect((thrown as ProcessExitError).exitCode).toBe(ExitCode.Failure);
    expect(lastOutput()).toContain('timeout');
  });
});
