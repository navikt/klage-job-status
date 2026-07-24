import { spawn } from 'node:child_process';
import { startValkey, stopValkey } from '@/e2e/docker-valkey';
import { DELETE_JOB_AFTER_SECONDS } from '@/e2e/helpers';

/**
 * Wraps `playwright test`, starting a throwaway Valkey Docker container beforehand and stopping
 * it afterwards.
 *
 * This lives outside `playwright.config.ts` on purpose: Playwright re-imports the config module
 * once per worker process, so anything with a side effect (like starting a Docker container)
 * at the top of the config file would run once per worker instead of once per test run. Doing
 * it here, in the single process that spawns `playwright test`, guarantees it only happens once.
 * The connection details are then passed down as environment variables, which the Next.js
 * server started by `playwright.config.ts`'s `webServer` inherits.
 *
 * `API_KEY_SECRET` only needs to be known server-side: tests never sign API keys themselves,
 * they fetch them from the real `/api/namespaces/[namespace]/keys` endpoint (see
 * `e2e/helpers.ts`), the same way the UI does.
 *
 * `DELETE_JOB_AFTER_SECONDS` shortens the TTL Valkey stores jobs with (30 days by default - see
 * `lib/jobs/index.ts`), so `e2e/job-lifecycle.test.ts` can actually wait for jobs to expire.
 * This is a test-only override, read from the environment in
 * `instrumentation-node.ts` - the unit tests (`lib/jobs/index.test.ts`) instead pass their
 * own short TTL directly to `JOBS.init()`, unrelated to this env var.
 */

const VALKEY_PASSWORD = 'e2e-test-password';
const API_KEY_SECRET = 'e2e-test-secret';

const stop = (): void => {
  stopValkey();
};

// Best-effort cleanup if the process is interrupted (e.g. Ctrl+C).
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(143);
});

const main = async (): Promise<number> => {
  const { port } = await startValkey(VALKEY_PASSWORD);

  const env = {
    ...process.env,
    REDIS_URI_KLAGE_JOB_STATUS: `redis://127.0.0.1:${port}/0`,
    REDIS_USERNAME_KLAGE_JOB_STATUS: 'default',
    REDIS_PASSWORD_KLAGE_JOB_STATUS: VALKEY_PASSWORD,
    API_KEY_SECRET,
    DELETE_JOB_AFTER_SECONDS: `${DELETE_JOB_AFTER_SECONDS}`,
  };

  const child = spawn('bunx', ['playwright', 'test', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env,
  });

  return await new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
  });
};

let exitCode = 1;

try {
  exitCode = await main();
} finally {
  stop();
}

process.exit(exitCode);
