import { spawnSync } from 'node:child_process';

/**
 * Starts and stops a throwaway Valkey Docker container for the Playwright E2E suite, mirroring
 * the pattern used by `lib/jobs/index.test.ts` for the unit tests.
 *
 * Uses `node:child_process` (rather than `Bun.spawn`) since `playwright.config.ts` and its
 * global setup/teardown are executed by the Playwright CLI, which spawns worker processes with
 * plain Node.js.
 */

let containerName: string | undefined;

/**
 * Starts a throwaway Valkey Docker container, publishing 6379 to a random host port so the
 * suite never collides with a Valkey instance already running locally (e.g. via the repo's
 * `docker-compose.yaml`). Resolves once the container is confirmed to accept connections.
 */
export const startValkey = async (password: string): Promise<{ port: number }> => {
  const name = `klage-job-status-e2e-valkey-${process.pid}-${Date.now()}`;

  const run = spawnSync('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    name,
    '-p',
    '127.0.0.1::6379',
    'valkey/valkey:alpine',
    'valkey-server',
    '--loglevel',
    'warning',
    '--requirepass',
    password,
  ]);

  if (run.status !== 0) {
    throw new Error(
      `Failed to start a temporary Valkey Docker container for the E2E tests. Is Docker running?\n${run.stderr.toString()}`,
    );
  }

  containerName = name;

  const port = await waitForPublishedPort(name);
  await waitUntilReady(name, password);

  return { port };
};

/** Stops and removes the container started by `startValkey`. No-op if it was never started. */
export const stopValkey = (): void => {
  if (containerName === undefined) {
    return;
  }

  spawnSync('docker', ['rm', '-f', containerName]);
  containerName = undefined;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `docker port` until Docker reports the host port it published for the container's 6379/tcp. */
const waitForPublishedPort = async (name: string): Promise<number> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = spawnSync('docker', ['port', name, '6379/tcp'], { encoding: 'utf-8' });
    const port = result.stdout.trim().split(':').pop();

    if (port !== undefined && port.length > 0) {
      const parsedPort = Number.parseInt(port, 10);

      if (!Number.isNaN(parsedPort)) {
        return parsedPort;
      }
    }

    await sleep(100);
  }

  throw new Error(`Timed out waiting for Docker to publish a port for container "${name}"`);
};

/** Polls the container with `valkey-cli ping` until it accepts authenticated connections. */
const waitUntilReady = async (name: string, password: string): Promise<void> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = spawnSync('docker', ['exec', name, 'valkey-cli', '--no-auth-warning', '-a', password, 'ping'], {
      encoding: 'utf-8',
    });

    if (result.stdout.trim() === 'PONG') {
      return;
    }

    await sleep(100);
  }

  throw new Error(`Timed out waiting for Valkey in container "${name}" to accept connections`);
};
