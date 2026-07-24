import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Shared test environment for unit tests that import `@action/input` (directly or transitively,
 * e.g. via `@action/http` or `@action/handle-job`).
 *
 * `@action/input` reads `process.env`/`process.argv` into module-level constants the moment it's
 * imported, and Bun's test runner shares a single module registry across every test file in a
 * run (there's no per-file `resetModules`) - so whichever test file imports `@action/input`
 * first "wins" and fixes these values for every other test file for the rest of the run.
 *
 * Importing *this* file first (it has no imports of its own, so it always finishes evaluating
 * before anything that imports `@action/input`) guarantees a single, consistent, GitHub
 * Actions-like environment for every unit test that needs one - matching `action.yaml`'s
 * defaults (`fail: true`, `fail_on_unknown: true`).
 *
 * Tests that need *different* values (e.g. `FAIL=false`, or a job that never appears) are
 * instead covered by `e2e/action.test.ts`, which spawns the action as a real child process per
 * test case, so each one gets its own independent environment.
 */

const dir = mkdtempSync(join(tmpdir(), 'klage-job-status-action-test-'));

// `@actions/core`'s `setOutput`/`setFailed` and `summary.write()` require these files to
// already exist (they open them for appending, they don't create them).
const githubOutput = join(dir, 'output');
const githubStepSummary = join(dir, 'summary.md');
writeFileSync(githubOutput, '');
writeFileSync(githubStepSummary, '');

process.env.GITHUB_ACTIONS = 'true';
process.env.JOB_ID = 'unit-test-job';
process.env.API_KEY = 'unit-test-namespace:read.unit-test-signature';
process.env.FAIL = 'true';
process.env.FAIL_ON_UNKNOWN = 'true';
process.env.GITHUB_OUTPUT = githubOutput;
process.env.GITHUB_STEP_SUMMARY = githubStepSummary;
// `@action/poll`'s internal "keep polling until the job ends or this elapses" loop reads this
// directly from `@action/input` (unlike `@action/run`'s own `timeoutSeconds`, which tests pass
// explicitly) - zero keeps that loop from ever running in `action/run.test.ts`, since it'd
// otherwise poll in a tight, un-mockable loop against a namespace/job that don't really exist.
process.env.timeout = '0';
