import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Context } from '@api/context';
import { ErrorEnum } from '@api/error';
import { JOBS } from '@api/jobs';
import { type Job, type JobEvent, JobEventType, Status } from '@common/common';

/**
 * These tests exercise `jobs.ts` against a real Valkey instance, running in a
 * throwaway Docker container, rather than a mock.
 *
 * Requires Docker to be installed and running locally.
 */

const CONTAINER_NAME = `klage-job-status-test-valkey-${crypto.randomUUID()}`;
const VALKEY_PASSWORD = 'test-password';
// Kept short so the "expired jobs are deleted" test doesn't have to wait long,
// while still comfortably outliving every other test's create -> assert round trip.
const DELETE_JOB_AFTER_SECONDS = 2;

let containerStarted = false;

const log: Context = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const uniqueId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

/** Polls `docker port` until Docker reports the host port it published for the container's 6379/tcp. */
const waitForPublishedPort = async (): Promise<number> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const proc = Bun.spawn(['docker', 'port', CONTAINER_NAME, '6379/tcp'], { stdout: 'pipe', stderr: 'pipe' });
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

  throw new Error(`Timed out waiting for Docker to publish a port for container "${CONTAINER_NAME}"`);
};

beforeAll(async () => {
  const run = Bun.spawn(
    [
      'docker',
      'run',
      '-d',
      '--rm',
      '--name',
      CONTAINER_NAME,
      // Publish 6379 to a random, Docker-assigned host port, so tests can run in parallel
      // and never collide with a `docker-compose` Valkey instance already running on 6379.
      '-p',
      '127.0.0.1::6379',
      'valkey/valkey:alpine',
      'valkey-server',
      '--loglevel',
      'warning',
      '--requirepass',
      VALKEY_PASSWORD,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const exitCode = await run.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(run.stderr).text();
    throw new Error(`Failed to start a temporary Valkey Docker container. Is Docker running?\n${stderr}`);
  }

  containerStarted = true;

  const port = await waitForPublishedPort();
  const connection = { uri: `redis://127.0.0.1:${port}/0`, username: 'default', password: VALKEY_PASSWORD };

  // Valkey inside the container may not accept connections the instant it starts.
  let lastError: unknown;

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await JOBS.init(connection, DELETE_JOB_AFTER_SECONDS);
      return;
    } catch (error) {
      lastError = error;
      await Bun.sleep(100);
    }
  }

  throw new Error(`Timed out waiting for Valkey to accept connections: ${lastError}`);
}, 30_000);

afterAll(() => {
  if (containerStarted) {
    Bun.spawnSync(['docker', 'rm', '-f', CONTAINER_NAME]);
  }
});

/** Resolves the first time `listener` is called, or rejects if it isn't called in time. */
const waitForEvent = (timeoutMs = 5_000): { promise: Promise<JobEvent>; listener: (event: JobEvent) => void } => {
  let resolve!: (event: JobEvent) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<JobEvent>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const timer = setTimeout(() => reject(new Error('Timed out waiting for pub/sub event')), timeoutMs);

  const listener = (event: JobEvent) => {
    clearTimeout(timer);
    resolve(event);
  };

  return { promise, listener };
};

describe('Jobs', () => {
  it('pings the server', async () => {
    expect(await JOBS.ping()).toBe(true);
  });

  describe('create', () => {
    it('creates a new job', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');

      const [job, error] = await JOBS.create(log, namespace, jobId, { name: 'My job', timeout: 1 });

      expect(error).toBeNull();
      expect(job).toMatchObject({
        id: jobId,
        namespace,
        name: 'My job',
        status: Status.RUNNING,
        ended: null,
        timeout: 1,
      });
    });

    it('clamps the requested timeout to DELETE_JOB_AFTER_SECONDS', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');

      const [job, error] = await JOBS.create(log, namespace, jobId, { timeout: DELETE_JOB_AFTER_SECONDS + 1000 });

      expect(error).toBeNull();
      expect(job?.timeout).toBe(DELETE_JOB_AFTER_SECONDS);
    });

    it('returns INVALID_JOB_ID for an empty namespace or job ID', async () => {
      const [job, error] = await JOBS.create(log, '', 'job-id');

      expect(job).toBeNull();
      expect(error).toBe(ErrorEnum.INVALID_JOB_ID);
    });

    it('returns ALREADY_EXISTS if the job already exists', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');

      await JOBS.create(log, namespace, jobId);
      const [job, error] = await JOBS.create(log, namespace, jobId);

      expect(job).toBeNull();
      expect(error).toBe(ErrorEnum.ALREADY_EXISTS);
    });
  });

  describe('get', () => {
    it('returns NOT_FOUND for a job that does not exist', async () => {
      const [job, error] = await JOBS.get(log, uniqueId('ns'), uniqueId('job'));

      expect(job).toBeNull();
      expect(error).toBe(ErrorEnum.NOT_FOUND);
    });

    it('returns an existing job', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');
      const [created] = await JOBS.create(log, namespace, jobId);

      const [fetched, error] = await JOBS.get(log, namespace, jobId);

      expect(error).toBeNull();
      expect(fetched).toEqual(created as Job);
    });

    it('marks a running job as TIMEOUT once its timeout has elapsed', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');
      await JOBS.create(log, namespace, jobId, { timeout: 0 });

      // A real (if tiny) sleep guarantees `Date.now()` has advanced past `created`, so the job
      // is reliably considered timed out, regardless of the system clock's resolution.
      await Bun.sleep(5);

      const [job, error] = await JOBS.get(log, namespace, jobId);

      expect(error).toBeNull();
      expect(job?.status).toBe(Status.TIMEOUT);
      expect(job?.ended).not.toBeNull();
    });
  });

  describe('update', () => {
    it('updates the status of a running job', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');
      await JOBS.create(log, namespace, jobId);

      const [updated, error] = await JOBS.update(log, namespace, jobId, Status.SUCCESS);

      expect(error).toBeNull();
      expect(updated?.status).toBe(Status.SUCCESS);
      expect(updated?.ended).not.toBeNull();
    });

    it('returns ALREADY_ENDED when updating an ended job to a different status', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');
      await JOBS.create(log, namespace, jobId);
      await JOBS.update(log, namespace, jobId, Status.SUCCESS);

      const [job, error] = await JOBS.update(log, namespace, jobId, Status.FAILED);

      expect(job).toBeNull();
      expect(error).toBe(ErrorEnum.ALREADY_ENDED);
    });

    it('is idempotent when updating an ended job to the same status', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');
      await JOBS.create(log, namespace, jobId);
      const [first] = await JOBS.update(log, namespace, jobId, Status.SUCCESS);

      const [second, error] = await JOBS.update(log, namespace, jobId, Status.SUCCESS);

      expect(error).toBeNull();
      expect(second).toEqual(first as Job);
    });

    it('returns NOT_FOUND when updating a job that does not exist', async () => {
      const [job, error] = await JOBS.update(log, uniqueId('ns'), uniqueId('job'), Status.SUCCESS);

      expect(job).toBeNull();
      expect(error).toBe(ErrorEnum.NOT_FOUND);
    });
  });

  describe('delete', () => {
    it('deletes an existing job', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');
      await JOBS.create(log, namespace, jobId);

      const error = await JOBS.delete(log, namespace, jobId);
      expect(error).toBeNull();

      const [job, getError] = await JOBS.get(log, namespace, jobId);
      expect(job).toBeNull();
      expect(getError).toBe(ErrorEnum.NOT_FOUND);
    });

    it('returns INVALID_JOB_ID for an empty namespace or job ID', async () => {
      const error = await JOBS.delete(log, '', 'job-id');
      expect(error).toBe(ErrorEnum.INVALID_JOB_ID);
    });
  });

  describe('expiry', () => {
    // `DELETE_JOB_AFTER_SECONDS` is set to a small value for this test file (see `beforeAll`),
    // so these tests wait slightly longer than that instead of mocking Valkey's clock. This
    // verifies the TTL is actually being set on the Valkey key, not just app-level bookkeeping.
    const expiredWaitMs = (DELETE_JOB_AFTER_SECONDS + 1) * 1_000;

    it('deletes a running job from Valkey after DELETE_JOB_AFTER_SECONDS elapses', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');
      await JOBS.create(log, namespace, jobId);

      await Bun.sleep(expiredWaitMs);

      const [job, error] = await JOBS.get(log, namespace, jobId);
      expect(job).toBeNull();
      expect(error).toBe(ErrorEnum.NOT_FOUND);
    }, 10_000);

    it('deletes an ended (updated) job from Valkey after DELETE_JOB_AFTER_SECONDS elapses', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');
      await JOBS.create(log, namespace, jobId);
      await JOBS.update(log, namespace, jobId, Status.SUCCESS);

      await Bun.sleep(expiredWaitMs);

      const [job, error] = await JOBS.get(log, namespace, jobId);
      expect(job).toBeNull();
      expect(error).toBe(ErrorEnum.NOT_FOUND);
    }, 10_000);
  });

  describe('getAll / getNamespaces', () => {
    it('returns all jobs in a namespace and lists the namespace', async () => {
      const namespace = uniqueId('ns');
      const jobIds = [uniqueId('job'), uniqueId('job'), uniqueId('job')];

      for (const jobId of jobIds) {
        await JOBS.create(log, namespace, jobId);
      }

      const jobs = await JOBS.getAll(log, namespace);
      expect(jobs.map((job) => job.id).toSorted()).toEqual(jobIds.toSorted());

      const namespaces = await JOBS.getNamespaces(log);
      expect(namespaces).toContain(namespace);
    });
  });

  describe('pub/sub', () => {
    it('notifies a channel subscriber when a job is created, updated and deleted', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');

      const created = waitForEvent();
      await JOBS.subscribe(log, namespace, jobId, created.listener);
      await JOBS.create(log, namespace, jobId);
      expect((await created.promise).eventType).toBe(JobEventType.CREATED);

      const updated = waitForEvent();
      await JOBS.subscribe(log, namespace, jobId, updated.listener);
      await JOBS.update(log, namespace, jobId, Status.SUCCESS);
      expect((await updated.promise).eventType).toBe(JobEventType.UPDATED);

      const deleted = waitForEvent();
      await JOBS.subscribe(log, namespace, jobId, deleted.listener);
      await JOBS.delete(log, namespace, jobId);
      expect((await deleted.promise).eventType).toBe(JobEventType.DELETED);

      await JOBS.unsubscribe(log, namespace, jobId);
    });

    it('notifies a pattern subscriber for jobs in a namespace', async () => {
      const namespace = uniqueId('ns');
      const jobId = uniqueId('job');

      const event = waitForEvent();
      await JOBS.subscribeAll(namespace, event.listener);
      await JOBS.create(log, namespace, jobId);

      expect((await event.promise).eventType).toBe(JobEventType.CREATED);

      await JOBS.unsubscribeAll(namespace);
    });
  });
});
