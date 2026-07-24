import { spawn } from 'node:child_process';

/**
 * Spawns `action/test-server.ts` as its own child process and waits for it to report it's ready.
 * See that file's own docs for why it needs to be a separate process rather than something
 * called in-process here.
 *
 * Uses `node:child_process.spawn`, not `Bun.spawn`, and `stop()` fully awaits the child's exit:
 * Bun's test runner kills any process it finds still running once it decides a boundary has been
 * crossed (logged as "killed N dangling processes") - empirically, that's not limited to
 * `Bun.spawn`-tracked processes, and not limited to file boundaries either. `action/action.test.ts`
 * avoids it by never letting this process outlive a single `test()` (started in `beforeEach`,
 * fully stopped - awaited - in `afterEach`), so there's no window where it could be mistaken for
 * dangling.
 */
export interface TestServerProcess {
  baseUrl: string;
  /** Resolves once the child process has actually exited, not just once `SIGTERM` was sent. */
  stop: () => Promise<void>;
}

const TEST_SERVER_ENTRY = new URL('./test-server.ts', import.meta.url).pathname;
const READY_PREFIX = 'READY ';

export const startTestServer = (): Promise<TestServerProcess> => {
  const child = spawn('bun', [TEST_SERVER_ENTRY], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: true,
  });
  child.unref();

  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      // If the child has already exited (e.g. it crashed, or a previous `stop()` call already
      // completed), the `exit` event has already fired and won't fire again - resolve
      // immediately instead of waiting forever for an event that isn't coming.
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }

      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out waiting for action/test-server.ts to become ready'));
    }, 30_000);

    let buffered = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      buffered += chunk.toString();

      const readyLine = buffered.split('\n').find((line) => line.startsWith(READY_PREFIX));

      if (readyLine !== undefined) {
        clearTimeout(timeout);
        const baseUrl = readyLine.slice(READY_PREFIX.length).trim();
        resolve({ baseUrl, stop });
      }
    });

    child.on('exit', () => {
      clearTimeout(timeout);
      reject(new Error('action/test-server.ts exited before becoming ready'));
    });
  });
};
