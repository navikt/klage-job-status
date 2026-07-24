import { expect, test } from '@playwright/test';
import { getApiKeysFromHomePage, uniqueJobId, uniqueNamespace } from '@/e2e/helpers';

/**
 * End-to-end test for API key scoping - see `e2e/helpers.ts` for how a namespace's API keys
 * are obtained. Job creation/status updates are done by external systems (CI jobs, scripts,
 * GitHub Actions, ...) using the API keys the UI hands out, so this uses the `request` fixture
 * directly against `/jobs/...`, exactly like a real caller would.
 */

test('a read-only key cannot create jobs', async ({ page, request }) => {
  const namespace = uniqueNamespace();
  const { readKey } = await getApiKeysFromHomePage(page, namespace);

  const response = await request.post(`/jobs/${uniqueJobId()}`, { headers: { API_KEY: readKey } });

  expect(response.status()).toBe(403);
});
