import { spyOn } from 'bun:test';

/**
 * Real `process.exit()` terminates the process synchronously - no code after the call site ever
 * runs. A plain no-op mock doesn't reproduce that: execution would continue into whatever comes
 * after the `process.exit(...)` call in the source (see e.g. `action/http.ts`'s `checkStatus`,
 * which has no `return` after its `process.exit` calls, relying on the process actually dying).
 *
 * Throwing this instead gives tests the same "nothing after this point runs" guarantee, while
 * still letting them assert on the intended exit code via `.exitCode`.
 */
export class ProcessExitError extends Error {
  constructor(public readonly exitCode: number) {
    super(`process.exit(${exitCode})`);
  }
}

/** Installs the `process.exit` mock described above. Call `.mockRestore()` in `afterEach`. */
export const mockProcessExit = () =>
  spyOn(process, 'exit').mockImplementation((code) => {
    throw new ProcessExitError(typeof code === 'number' ? code : 0);
  });

/**
 * `@actions/core`'s `setFailed()` (unlike `process.exit()`, which `mockProcessExit` mocks) isn't
 * stubbed, so it really does set `process.exitCode` on the actual test process when a test
 * exercises a "failed"/"timed out" path. Left alone, that leaks past the test into `bun test`'s
 * own exit code, making the whole run "fail" even when every test passed. Call this in
 * `afterEach`, alongside `exit.mockRestore()`.
 *
 * Explicitly `0`, not `undefined` - in Bun, once `process.exitCode` has been set to a non-zero
 * value, setting it to `undefined` again does *not* clear it (verified empirically); only
 * assigning another concrete number does.
 */
export const resetProcessExitCode = (): void => {
  process.exitCode = 0;
};
