import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';

export interface ApiKeys {
  readKey: string;
  writeKey: string;
}

const API_KEY_PATTERN = /^[a-z\d_-]+:(read|write)\.[\w-]+$/;

/**
 * Overrides Valkey's job TTL (`DELETE_JOB_AFTER_SECONDS`, normally 30 days - see
 * `lib/jobs/index.ts`) for the whole E2E run, read from the environment in
 * `instrumentation-node.ts`. `e2e/run.ts` passes this same value to the server it starts, so
 * the lifecycle test in `e2e/job-lifecycle.test.ts` can actually wait for a job to expire from Valkey.
 *
 * This is unrelated to the unit tests (`lib/jobs/index.test.ts`), which instead pass their own
 * short TTL directly to `JOBS.init()`.
 */
export const DELETE_JOB_AFTER_SECONDS = 15;

/**
 * Fetches API keys for a namespace the way a first-time user does: from the front page, via the
 * "Create Namespace" modal (`components/CreateNamespace.tsx`).
 *
 * Despite the button's name, this doesn't persist anything - `generateApiKey` (see
 * `lib/api-key/create.ts`) just HMAC-signs `<namespace>:<scope>` on the fly, without writing to
 * Valkey. A namespace only starts to actually exist (e.g. shows up in `GET /api/namespaces`)
 * once a job is written to it with one of these keys.
 */
export const getApiKeysFromHomePage = async (page: Page, namespace: string): Promise<ApiKeys> => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Namespace' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Namespace').fill(namespace);

  const keys = await readApiKeysFromDialog(dialog);
  await dialog.getByRole('button', { name: 'Close' }).click();

  return keys;
};

/**
 * Fetches API keys for a namespace the way a returning user does: navigate directly to that
 * namespace's dashboard and click "Show API keys" in the header
 * (`components/api-keys/ShowApiKeys.tsx`). Same underlying (non-persisting) key generation as
 * `getApiKeysFromHomePage` - see its docs.
 */
export const getApiKeysFromNamespaceDashboard = async (page: Page, namespace: string): Promise<ApiKeys> => {
  await page.goto(`/namespace/${namespace}`);
  await page.getByRole('button', { name: 'Show API keys' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const keys = await readApiKeysFromDialog(dialog);
  await dialog.getByRole('button', { name: 'Close' }).click();

  return keys;
};

/**
 * Reads the two API key values out of an open "API keys" modal. Scoped to `.break-all` (unique
 * to `components/api-keys/ApiKey.tsx`'s rendered key), since the "Create Namespace" modal
 * also contains an unrelated `font-mono` example namespace in its info box.
 */
const readApiKeysFromDialog = async (dialog: Locator): Promise<ApiKeys> => {
  const keySpans = dialog.locator('span.break-all');

  await expect(keySpans).toHaveCount(2);
  await expect(keySpans.first()).toHaveText(API_KEY_PATTERN);
  await expect(keySpans.last()).toHaveText(API_KEY_PATTERN);

  const [readKey, writeKey] = await keySpans.allTextContents();

  if (readKey === undefined || writeKey === undefined) {
    throw new Error('Failed to read API keys from the dialog');
  }

  return { readKey, writeKey };
};

/** A namespace unique to this test run, so parallel/repeated runs never collide. */
export const uniqueNamespace = (): string => `e2e${randomUUID().replaceAll('-', '').slice(0, 16)}`;

/** A job ID unique to this test run. */
export const uniqueJobId = (): string => `job-${randomUUID()}`;
