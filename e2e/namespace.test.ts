import { expect, test } from '@playwright/test';
import { NO_JOBS_MESSAGE, totalJobsCount } from '@/e2e/dashboard';
import { getApiKeysFromHomePage, getApiKeysFromNamespaceDashboard, uniqueJobId, uniqueNamespace } from '@/e2e/helpers';

/**
 * End-to-end tests for namespace creation and lookup - see `e2e/helpers.ts` for how a
 * namespace's API keys are obtained. Note that neither the "Create Namespace" nor "Show API
 * keys" modal actually persists anything: `generateApiKey` (`lib/api-key/create.ts`) just
 * HMAC-signs `<namespace>:<scope>` on the fly. A namespace only starts to really exist once a
 * job is written to it with one of these keys - see the first test below.
 */

test('a namespace only starts to exist once a job is written to it', async ({ page, request }) => {
  const namespace = uniqueNamespace();

  await page.goto(`/namespace/${namespace}`);

  await expect(page.getByText(NO_JOBS_MESSAGE)).toBeVisible();
  await expect(totalJobsCount(page)).toHaveText('0');

  // Prove it wasn't just never-created to begin with: having visited its (empty) dashboard
  // still leaves no trace - `/namespace/[namespace]` (`app/namespace/[namespace]/page.tsx`) is
  // backed only by read-only calls. A namespace only starts to really exist once a job is
  // actually written to it.
  const namespacesRes = await request.get('/api/namespaces', { headers: { Accept: 'application/json' } });
  expect(await namespacesRes.json()).not.toContain(namespace);
});

test('an existing namespace\'s keys can be fetched again via "Show API keys"', async ({ page, request }) => {
  const namespace = uniqueNamespace();

  // First-time setup, as a different user/session might have done earlier.
  const expectedKeys = await getApiKeysFromHomePage(page, namespace);

  // Later, someone navigates straight to the namespace and re-fetches its keys.
  const actualKeys = await getApiKeysFromNamespaceDashboard(page, namespace);

  expect(actualKeys).toEqual(expectedKeys);

  const { writeKey } = actualKeys;

  const createRes = await request.post(`/jobs/${uniqueJobId()}`, { headers: { API_KEY: writeKey } });
  expect(createRes.status()).toBe(201);
});
