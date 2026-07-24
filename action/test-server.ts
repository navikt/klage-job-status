import { GET as getFailed, PUT as setFailed } from '@/app/jobs/[jobId]/failed/route';
import { POST as createJob, GET as getJob } from '@/app/jobs/[jobId]/route';
import { GET as getSuccess, PUT as setSuccess } from '@/app/jobs/[jobId]/success/route';
import { JOBS, type ValkeyConnection } from '@/lib/jobs';

/**
 * A minimal real HTTP server for `action/action.test.ts` - dispatches directly to the same route
 * handler functions Next.js calls (`app/jobs/[jobId]/route.ts` and its `success`/`failed`
 * sub-routes), against a real Valkey. No Next.js/Turbopack/Playwright/browser involved: this is
 * just Bun's own `routes` support (see https://bun.sh/docs/api/http#routes) wiring real requests
 * straight to real handlers, which is all `action/action.ts` (a plain HTTP client) needs to
 * connect to - unlike `e2e/*.test.ts`, which exercise the dashboard UI and so need the real
 * Next.js server.
 *
 * This file is a standalone entry point (run via `Bun.spawn` from `action/test-server-client.ts`,
 * not imported directly) rather than something `action/action.test.ts` calls in-process. `JOBS`
 * (`@/lib/jobs`) is a module-level singleton - `lib/jobs/index.test.ts` also initializes it,
 * against its own separate Valkey, and initializing the same singleton twice in one process
 * would have whichever test file runs first "win" for the rest (Bun shares one module registry
 * across all files in a `bun test` run). Running this in its own process instead means
 * `action.test.ts` and `lib/jobs/index.test.ts` can both run as part of a single, ordinary
 * `bun test` - in either `action/` or the repo root - with no special flags or exclusions needed.
 */

/** `{ params }` on these route handlers is `Promise<...>` - Bun's own `req.params` isn't. */
type RouteParams<Params extends Record<string, string>> = { params: Promise<Params> };

const withParams = <Params extends Record<string, string>>(params: Params): RouteParams<Params> => ({
  params: Promise.resolve(params),
});

const startServer = (): { url: string; stop: () => void } => {
  const server = Bun.serve({
    port: 0,
    routes: {
      '/jobs/:jobId': {
        GET: (req) => getJob(req, withParams(req.params)),
        POST: (req) => createJob(req, withParams(req.params)),
      },
      '/jobs/:jobId/success': {
        GET: (req) => getSuccess(req, withParams(req.params)),
        PUT: (req) => setSuccess(req, withParams(req.params)),
      },
      '/jobs/:jobId/failed': {
        GET: (req) => getFailed(req, withParams(req.params)),
        PUT: (req) => setFailed(req, withParams(req.params)),
      },
    },
    fetch: () => new Response('Not found', { status: 404 }),
  });

  return { url: server.url.toString().replace(/\/$/, ''), stop: () => server.stop(true) };
};

const startValkey = async (): Promise<{ connection: ValkeyConnection; stop: () => void }> => {
  const containerName = `klage-job-status-action-test-valkey-${crypto.randomUUID()}`;
  const password = 'action-test-password';

  const run = Bun.spawnSync(
    [
      'docker',
      'run',
      '-d',
      '--rm',
      '--name',
      containerName,
      '-p',
      '127.0.0.1::6379',
      'valkey/valkey:alpine',
      'valkey-server',
      '--loglevel',
      'warning',
      '--requirepass',
      password,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  if (run.exitCode !== 0) {
    throw new Error(`Failed to start a temporary Valkey Docker container. Is Docker running?\n${run.stderr}`);
  }

  const stop = () => {
    Bun.spawnSync(['docker', 'rm', '-f', containerName]);
  };

  try {
    const port = await waitForPublishedPort(containerName);
    const connection: ValkeyConnection = { uri: `redis://127.0.0.1:${port}/0`, username: 'default', password };

    return { connection, stop };
  } catch (e) {
    stop();
    throw e;
  }
};

const waitForPublishedPort = async (containerName: string): Promise<number> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const proc = Bun.spawn(['docker', 'port', containerName, '6379/tcp'], { stdout: 'pipe', stderr: 'pipe' });
    const [output] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    const port = output.trim().split(':').pop();

    if (port !== undefined && port.length > 0) {
      const parsedPort = Number.parseInt(port, 10);

      if (!Number.isNaN(parsedPort)) {
        return parsedPort;
      }
    }

    await Bun.sleep(100);
  }

  throw new Error(`Timed out waiting for Docker to publish a port for container "${containerName}"`);
};

const waitUntilReady = async (connection: ValkeyConnection): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await JOBS.init(connection);
      return;
    } catch (e) {
      lastError = e;
      await Bun.sleep(100);
    }
  }

  throw new Error(`Timed out waiting for Valkey to accept connections: ${lastError}`);
};

/** `READY <url>` on its own stdout line signals to `action/test-server-client.ts` that setup is done. */
const READY_PREFIX = 'READY ';

const main = async (): Promise<void> => {
  console.error(`[test-server] starting valkey at ${new Date().toISOString()} pid=${process.pid}`);
  const valkey = await startValkey();
  console.error(`[test-server] valkey started at ${new Date().toISOString()}`);
  await waitUntilReady(valkey.connection);

  const server = startServer();

  const shutdown = () => {
    console.error(`[test-server] shutdown at ${new Date().toISOString()}`);
    server.stop();
    valkey.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.error(`[test-server] ready at ${new Date().toISOString()}`);
  console.log(`${READY_PREFIX}${server.url}`);
};

await main();
