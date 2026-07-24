import { expect, test } from '@playwright/test';
import {
  jobCard,
  NO_JOBS_MESSAGE,
  retryUntilHydrated,
  searchInput,
  sortButton,
  statusFilter,
  visibleJobCardsText,
} from '@/e2e/dashboard';
import { getApiKeysFromHomePage, uniqueJobId, uniqueNamespace } from '@/e2e/helpers';
import type { CreateJobInput } from '@/lib/types';

/**
 * End-to-end tests for the dashboard's status filter, text filter and sorting
 * (`components/SearchFilter.tsx` and `components/JobsList/Sorting.tsx`). Jobs are created via
 * the API - exactly like a real caller would - and all filtering/sorting is then driven and
 * asserted through the UI.
 */

test('status filter shows only jobs with the selected status', async ({ page, request }) => {
  // A generous timeout: see the comment on the first `toBeVisible()` call below for why the
  // very first live update after navigating can legitimately take a while under CI load.
  test.setTimeout(45_000);

  const namespace = uniqueNamespace();
  const runningJobId = uniqueJobId();
  const succeededJobId = uniqueJobId();
  const failedJobId = uniqueJobId();

  const headers = await test.step('create namespace via "Create Namespace" modal', async () => {
    const { writeKey } = await getApiKeysFromHomePage(page, namespace);
    return { API_KEY: writeKey, 'Content-Type': 'application/json' };
  });

  const runningCard = jobCard(page, runningJobId);
  const succeededCard = jobCard(page, succeededJobId);
  const failedCard = jobCard(page, failedJobId);

  await page.goto(`/namespace/${namespace}`);
  await expect(page.getByText(NO_JOBS_MESSAGE)).toBeVisible();

  await test.step('create three jobs, all RUNNING, and see them appear live', async () => {
    const createRes = await Promise.all(
      [runningJobId, succeededJobId, failedJobId].map((jobId) =>
        request.post(`/jobs/${jobId}`, { headers, data: { name: jobId } satisfies CreateJobInput }),
      ),
    );

    for (const res of createRes) {
      expect(res.status()).toBe(201);
    }

    // A generous timeout on this first assertion only: Next.js dev serves many small JS chunks
    // per page load (unbundled dev output), typically capped at ~6 concurrent HTTP/1.1
    // connections per origin - so the browser's `EventSource` connection (opened once the page
    // hydrates) can end up queued behind those chunk requests. Under CI's added per-request
    // latency that queueing can add several real seconds before this first live update actually
    // arrives, well before anything is actually wrong.
    await expect(runningCard).toBeVisible({ timeout: 30_000 });
    await expect(succeededCard).toBeVisible();
    await expect(failedCard).toBeVisible();
  });

  await test.step('end two of them in different terminal states and see the change live', async () => {
    // The page (and its SSE subscription) is already open at this point, so - unlike issuing
    // these transitions before navigating - there's no risk of the dashboard's initial render
    // racing these API calls: each card is only asserted to have flipped to its terminal status
    // once the live update has actually been applied.
    const succeededRes = await request.put(`/jobs/${succeededJobId}/success`, { headers });
    expect(succeededRes.status()).toBe(200);
    await expect(succeededCard.getByText('SUCCESS', { exact: true })).toBeVisible();

    const failedRes = await request.put(`/jobs/${failedJobId}/failed`, { headers });
    expect(failedRes.status()).toBe(200);
    await expect(failedCard.getByText('FAILED', { exact: true })).toBeVisible();
  });

  await test.step('filtering by "running" shows only the running job', async () => {
    // Retries the click itself, not just the assertions below: this is the first interaction on
    // this page load, and Next.js streams server-rendered HTML before client-side React
    // hydrates it - a click landing in that window has no listener attached yet and is silently
    // swallowed, so simply re-asserting wouldn't recover (see `retryUntilHydrated`).
    await retryUntilHydrated(async () => {
      await statusFilter(page, 'running').click();
      await expect(runningCard).toBeVisible();
      await expect(succeededCard).not.toBeVisible();
      await expect(failedCard).not.toBeVisible();
    });
  });

  await test.step('filtering by "success" shows only the succeeded job', async () => {
    await statusFilter(page, 'success').click();
    await expect(succeededCard).toBeVisible();
    await expect(runningCard).not.toBeVisible();
    await expect(failedCard).not.toBeVisible();
  });

  await test.step('filtering by "failed" shows only the failed job', async () => {
    await statusFilter(page, 'failed').click();
    await expect(failedCard).toBeVisible();
    await expect(runningCard).not.toBeVisible();
    await expect(succeededCard).not.toBeVisible();
  });

  await test.step('filtering by "timeout" shows no jobs, since none have timed out', async () => {
    await statusFilter(page, 'timeout').click();
    await expect(page.getByText(NO_JOBS_MESSAGE)).toBeVisible();
    await expect(runningCard).not.toBeVisible();
    await expect(succeededCard).not.toBeVisible();
    await expect(failedCard).not.toBeVisible();
  });

  await test.step('switching back to "All" shows every job again', async () => {
    await statusFilter(page, 'All').click();
    await expect(runningCard).toBeVisible();
    await expect(succeededCard).toBeVisible();
    await expect(failedCard).toBeVisible();
  });
});

test('text filter matches job names, case-insensitively, and is combinable with the status filter', async ({
  page,
  request,
}) => {
  const namespace = uniqueNamespace();
  const alphaJobId = uniqueJobId();
  const betaJobId = uniqueJobId();

  const headers = await test.step('create namespace via "Create Namespace" modal', async () => {
    const { writeKey } = await getApiKeysFromHomePage(page, namespace);
    return { API_KEY: writeKey, 'Content-Type': 'application/json' };
  });

  await test.step('create two jobs with distinctive names', async () => {
    const alphaRes = await request.post(`/jobs/${alphaJobId}`, {
      headers,
      data: { name: 'Alpha Importer' } satisfies CreateJobInput,
    });

    expect(alphaRes.status()).toBe(201);

    const betaRes = await request.post(`/jobs/${betaJobId}`, {
      headers,
      data: { name: 'Beta Exporter' } satisfies CreateJobInput,
    });

    expect(betaRes.status()).toBe(201);
  });

  const alphaCard = jobCard(page, alphaJobId);
  const betaCard = jobCard(page, betaJobId);

  await page.goto(`/namespace/${namespace}`);
  await expect(alphaCard).toBeVisible();
  await expect(betaCard).toBeVisible();

  await test.step('searching (any case) for part of a job name shows only the matching job', async () => {
    // Retries the fill itself, not just the assertions below: this is the first interaction on
    // this page load, and typing into a not-yet-hydrated *controlled* input can have its value
    // silently reverted back to React's (unchanged) tracked state once hydration commits (see
    // `retryUntilHydrated`).
    await retryUntilHydrated(async () => {
      await searchInput(page).fill('ALPHA');
      await expect(searchInput(page)).toHaveValue('ALPHA');
    });
    await expect(alphaCard).toBeVisible();
    await expect(betaCard).not.toBeVisible();
  });

  await test.step('searching for a name that matches nothing shows the empty state', async () => {
    await searchInput(page).fill('gamma');
    await expect(page.getByText(NO_JOBS_MESSAGE)).toBeVisible();
    await expect(alphaCard).not.toBeVisible();
    await expect(betaCard).not.toBeVisible();
  });

  await test.step('clearing the search shows both jobs again', async () => {
    await searchInput(page).clear();
    await expect(alphaCard).toBeVisible();
    await expect(betaCard).toBeVisible();
  });

  await test.step('the text filter combines with the status filter', async () => {
    const succeededRes = await request.put(`/jobs/${alphaJobId}/success`, { headers });
    expect(succeededRes.status()).toBe(200);
    // Wait for the live update to actually apply before filtering by it below - the page (and
    // its SSE subscription) was already open when the transition above was requested, but the
    // update still arrives asynchronously.
    await expect(alphaCard.getByText('SUCCESS', { exact: true })).toBeVisible();

    await searchInput(page).fill('exporter');
    await statusFilter(page, 'success').click();

    // "Beta Exporter" matches the search but is still RUNNING; "Alpha Importer" is SUCCESS but
    // doesn't match the search - neither should be shown.
    await expect(page.getByText(NO_JOBS_MESSAGE)).toBeVisible();
    await expect(alphaCard).not.toBeVisible();
    await expect(betaCard).not.toBeVisible();
  });
});

test('sorting reorders the job list and toggles direction when the same field is clicked again', async ({
  page,
  request,
}) => {
  // Sorting itself is instant (client-side state, no network round trip), but jobs' Valkey TTL
  // is shortened for this suite (`DELETE_JOB_AFTER_SECONDS`, see `e2e/helpers.ts`) - keep this
  // test comfortably under that so jobs don't expire mid-test.
  test.setTimeout(15_000);

  const namespace = uniqueNamespace();
  const firstJobId = uniqueJobId();
  const secondJobId = uniqueJobId();
  const thirdJobId = uniqueJobId();

  const headers = await test.step('create namespace via "Create Namespace" modal', async () => {
    const { writeKey } = await getApiKeysFromHomePage(page, namespace);
    return { API_KEY: writeKey, 'Content-Type': 'application/json' };
  });

  await test.step('create three jobs, one after another, so their "created" timestamps differ', async () => {
    for (const jobId of [firstJobId, secondJobId, thirdJobId]) {
      const res = await request.post(`/jobs/${jobId}`, { headers, data: { name: jobId } satisfies CreateJobInput });
      expect(res.status()).toBe(201);
    }
  });

  const indexOf = (cardsText: Array<string>, jobId: string): number =>
    cardsText.findIndex((text) => text.includes(jobId));

  /** Asserts the given job IDs appear, in this exact order, among the rendered job cards. */
  const expectOrder = (jobIdsInExpectedOrder: ReadonlyArray<string>): Promise<void> =>
    expect
      .poll(async () => {
        const cardsText = await visibleJobCardsText(page);
        return jobIdsInExpectedOrder.map((jobId) => indexOf(cardsText, jobId));
      })
      .toEqual(jobIdsInExpectedOrder.map((_, position) => position));

  /** Asserts `jobId` is the first job rendered, without constraining the rest of the order. */
  const expectFirst = (jobId: string): Promise<void> =>
    expect
      .poll(async () => {
        const cardsText = await visibleJobCardsText(page);
        return indexOf(cardsText, jobId);
      })
      .toBe(0);

  await page.goto(`/namespace/${namespace}`);
  await expect(jobCard(page, thirdJobId)).toBeVisible();

  await test.step('by default (Created, descending) the most recently created job comes first', async () => {
    await expectOrder([thirdJobId, secondJobId, firstJobId]);
  });

  await test.step('clicking "Created" again toggles to ascending: the oldest job comes first', async () => {
    // Retries the click itself, not just the (already auto-retrying) order assertion: this is
    // the first interaction on this page load (see `retryUntilHydrated`).
    await retryUntilHydrated(async () => {
      await sortButton(page, 'Created').click();
      await expectOrder([firstJobId, secondJobId, thirdJobId]);
    });
  });

  await test.step('updating the first job makes it the most recently modified', async () => {
    const runningRes = await request.put(`/jobs/${firstJobId}/running`, { headers });
    expect(runningRes.status()).toBe(200);
  });

  await test.step('switching to "Modified" resets to descending: the just-updated job comes first', async () => {
    // Only the just-updated job's relative position is asserted here - the other two jobs were
    // created together and may have identical "modified" timestamps, so their relative order
    // (a tie) isn't guaranteed to be deterministic.
    await sortButton(page, 'Modified').click();
    await expectFirst(firstJobId);
  });
});
