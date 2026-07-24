import { expect, test } from '@playwright/test';
import {
  DATE_TIME_PATTERN,
  DURATION_PATTERN,
  jobCard,
  jobDetailValue,
  NO_JOBS_MESSAGE,
  totalJobsCount,
} from '@/e2e/dashboard';
import { DELETE_JOB_AFTER_SECONDS, getApiKeysFromHomePage, uniqueJobId, uniqueNamespace } from '@/e2e/helpers';
import { formatSeconds } from '@/functions/format';
import type { CreateJobInput } from '@/lib/types';

/**
 * End-to-end test driving the real browser UI wherever the product actually exposes one - see
 * `e2e/helpers.ts` for how a namespace's API keys are obtained. There's no UI for creating or
 * updating a job's status - that's done by external systems (CI jobs, scripts, GitHub Actions,
 * ...) using the API keys the UI hands out, so those steps use the `request` fixture directly
 * against `/jobs/...`, exactly like a real caller would. The dashboard itself - fetching API
 * keys, the empty state, jobs appearing live via SSE, status changes, and deleting a job - is
 * driven entirely through `page`.
 */

test('the full job lifecycle is reflected live on the dashboard: created, updated, succeeded, failed, timed out, deleted and expired', async ({
  page,
  request,
}) => {
  // Several jobs' Valkey TTL (`DELETE_JOB_AFTER_SECONDS`, shortened for this suite - see
  // `e2e/helpers.ts`) has to actually elapse near the end of this test.
  test.setTimeout(60_000);

  const namespace = uniqueNamespace();
  const succeedingJobId = uniqueJobId();
  const failingJobId = uniqueJobId();
  const timingOutJobId = uniqueJobId();

  const timingOutTimeoutSeconds = 3;

  const headers = await test.step('create namespace via "Create Namespace" modal', async () => {
    const { writeKey } = await getApiKeysFromHomePage(page, namespace);

    return { API_KEY: writeKey, 'Content-Type': 'application/json' };
  });

  await test.step('dashboard has no jobs yet', async () => {
    await page.goto(`/namespace/${namespace}`);
    await expect(page.getByText(NO_JOBS_MESSAGE)).toBeVisible();
    await expect(totalJobsCount(page)).toHaveText('0');
  });

  const { succeedingCard, failingCard, timingOutCard } = await test.step('create three jobs', async () => {
    // One will succeed, one will fail, and one will time out on its own. The timing-out job
    // gets a short timeout, comfortably inside `DELETE_JOB_AFTER_SECONDS`, so it has time to
    // actually flip to TIMEOUT before its Valkey key expires.
    expect(timingOutTimeoutSeconds).toBeLessThan(DELETE_JOB_AFTER_SECONDS);

    const jobsToCreate: ReadonlyArray<readonly [jobId: string, data: CreateJobInput]> = [
      [succeedingJobId, { name: 'Will succeed' }],
      [failingJobId, { name: 'Will fail' }],
      [timingOutJobId, { name: 'Will time out', timeout: timingOutTimeoutSeconds }],
    ];

    for (const [jobId, data] of jobsToCreate) {
      const res = await request.post(`/jobs/${jobId}`, { headers, data });
      expect(res.status()).toBe(201);
    }

    return {
      succeedingCard: jobCard(page, succeedingJobId),
      failingCard: jobCard(page, failingJobId),
      timingOutCard: jobCard(page, timingOutJobId),
    };
  });

  await test.step('all three appear live on the dashboard, all RUNNING', async () => {
    // Pushed over SSE to the already-open dashboard, with a live "Updated" timestamp and an
    // incrementing "Duration" (both still ticking since they're running).
    //
    // A generous timeout on this first assertion only: Next.js dev serves many small JS chunks
    // per page load (unbundled dev output), typically capped at ~6 concurrent HTTP/1.1
    // connections per origin - so the browser's `EventSource` connection (opened by
    // `JobsContext` once the page hydrates) can end up queued behind those chunk requests. Under
    // CI's added per-request latency that queueing can add several real seconds before the
    // connection - and thus this first live update - actually arrives, well before anything is
    // actually wrong. Once connected, the dashboard's `JobsContext` also always resyncs its full
    // job list (see `app/api/jobs/[namespace]/route.ts`), so nothing is lost while waiting.
    await expect(succeedingCard).toBeVisible({ timeout: 30_000 });
    await expect(failingCard).toBeVisible();
    await expect(timingOutCard).toBeVisible();
    await expect(totalJobsCount(page)).toHaveText('3');
    await expect(succeedingCard.getByText('RUNNING', { exact: true })).toBeVisible();
    await expect(failingCard.getByText('RUNNING', { exact: true })).toBeVisible();
    await expect(jobDetailValue(succeedingCard, 'Updated')).toHaveText(DATE_TIME_PATTERN);
    await expect(jobDetailValue(succeedingCard, 'Duration')).toHaveText(DURATION_PATTERN);
    await expect(jobDetailValue(failingCard, 'Updated')).toHaveText(DATE_TIME_PATTERN);
    await expect(jobDetailValue(failingCard, 'Duration')).toHaveText(DURATION_PATTERN);
  });

  await test.step('update running jobs a few times (idempotent no-op transitions)', async () => {
    for (let i = 0; i < 2; i++) {
      const succeedingRes = await request.put(`/jobs/${succeedingJobId}/running`, { headers });
      expect(succeedingRes.status()).toBe(200);

      const failingRes = await request.put(`/jobs/${failingJobId}/running`, { headers });
      expect(failingRes.status()).toBe(200);
    }
  });

  await test.step('they are still shown as RUNNING', async () => {
    await expect(succeedingCard.getByText('RUNNING', { exact: true })).toBeVisible();
    await expect(failingCard.getByText('RUNNING', { exact: true })).toBeVisible();
  });

  await test.step('fail the first job and see it update live', async () => {
    // The badge flips to FAILED, "Updated" becomes "Ended" with a real timestamp, and
    // "Duration" stops ticking (frozen at whatever it last showed, since the job ended in well
    // under a second - but still a valid duration string).
    const failedRes = await request.put(`/jobs/${failingJobId}/failed`, { headers });
    expect(failedRes.status()).toBe(200);

    await expect(failingCard.getByText('FAILED', { exact: true })).toBeVisible();
    await expect(jobDetailValue(failingCard, 'Ended')).toHaveText(DATE_TIME_PATTERN);
    await expect(jobDetailValue(failingCard, 'Duration')).toHaveText(DURATION_PATTERN);
  });

  await test.step('succeed the second job and see it update live, the same way', async () => {
    const successRes = await request.put(`/jobs/${succeedingJobId}/success`, { headers });
    expect(successRes.status()).toBe(200);

    await expect(succeedingCard.getByText('SUCCESS', { exact: true })).toBeVisible();
    await expect(jobDetailValue(succeedingCard, 'Ended')).toHaveText(DATE_TIME_PATTERN);
    await expect(jobDetailValue(succeedingCard, 'Duration')).toHaveText(DURATION_PATTERN);
  });

  await test.step('the third job times out on its own and updates live', async () => {
    // The internal watchdog flips it to TIMEOUT and publishes a live update - no API call
    // needed. Unlike the succeeded/failed jobs above, a timed-out job's "Duration" is
    // deterministic - it's always exactly its configured timeout
    // (`components/job-card/Duration.tsx`), so this can assert the precise value instead of
    // just the format.
    await expect(timingOutCard.getByText('TIMEOUT', { exact: true })).toBeVisible();
    await expect(jobDetailValue(timingOutCard, 'Ended')).toHaveText(DATE_TIME_PATTERN);
    await expect(jobDetailValue(timingOutCard, 'Duration')).toHaveText(formatSeconds(timingOutTimeoutSeconds));
  });

  await test.step('delete the timed-out job from the dashboard, see it disappear live', async () => {
    await timingOutCard.getByRole('button', { name: 'Delete job' }).click();

    await expect(timingOutCard).not.toBeVisible();
    await expect(totalJobsCount(page)).toHaveText('2');
  });

  await test.step('remaining jobs expire from Valkey and disappear live', async () => {
    // Their TTL was refreshed by their last status update, and nothing else deletes them, so
    // once Valkey drops the keys the expired-key subscription
    // (`JobPubSub#subscribeToExpiredKeys`) should publish live DELETED events for both. Verify
    // the live update: no jobs left, without ever reloading the page.
    const expiredJobsWaitTimeoutMs = (DELETE_JOB_AFTER_SECONDS + 10) * 1_000;
    await expect(page.getByText(NO_JOBS_MESSAGE)).toBeVisible({ timeout: expiredJobsWaitTimeoutMs });
    await expect(succeedingCard).not.toBeVisible();
    await expect(failingCard).not.toBeVisible();
    await expect(totalJobsCount(page)).toHaveText('0');
  });
});
