import { JOBS, type ValkeyConnection } from '@/lib/jobs';
import { LOGS } from '@/lib/logging';

/**
 * `DELETE_JOB_AFTER_SECONDS` lets the E2E test suite (`e2e/`) shrink the TTL Valkey stores
 * jobs with, so a test can actually wait for a job to expire instead of the default 30 days.
 * Returning `undefined` when unset falls through to `Jobs#init`'s own default.
 */
const getDeleteJobAfterSecondsOverride = (): number | undefined => {
  const value = process.env.DELETE_JOB_AFTER_SECONDS;

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    LOGS.warn(`Ignoring invalid DELETE_JOB_AFTER_SECONDS "${value}"`, 'init');
    return undefined;
  }

  return parsed;
};

/**
 * Opens the long-lived Valkey connection used by the API route handlers. Runs once per
 * server process at startup, only under the Node.js runtime (see `./instrumentation.ts`).
 */
try {
  const connection: ValkeyConnection = {
    uri: process.env.REDIS_URI_KLAGE_JOB_STATUS,
    username: process.env.REDIS_USERNAME_KLAGE_JOB_STATUS,
    password: process.env.REDIS_PASSWORD_KLAGE_JOB_STATUS,
  };

  await JOBS.init(connection, getDeleteJobAfterSecondsOverride());
} catch (error) {
  LOGS.error('Failed to initialize Jobs system', 'init', {
    error: error instanceof Error ? error : 'Unknown error',
  });
}
