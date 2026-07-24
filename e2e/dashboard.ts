import { expect, type Locator, type Page } from '@playwright/test';

/** Rendered by `components/JobsList/JobsList.tsx` whenever the (possibly filtered) job list is empty. */
export const NO_JOBS_MESSAGE = 'No jobs found matching your filters.';

/** Matches the `HH:MM:SS` format `functions/format.ts#formatJobDuration`/`formatSeconds` render. */
export const DURATION_PATTERN = /^\d{2}:\d{2}:\d{2}$/;

/** Matches the `dd.MM.yyyy HH:mm:ss` format `functions/format.ts#formatDate` renders (used for both "Updated" and "Ended"). */
export const DATE_TIME_PATTERN = /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/;

export const jobCard = (page: Page, jobId: string): Locator => page.locator('li').filter({ hasText: jobId });

export const totalJobsCount = (page: Page): Locator =>
  page.getByText('Total Jobs', { exact: true }).locator('xpath=preceding-sibling::span[1]');

type JobDetailLabel = 'Updated' | 'Ended' | 'Duration';

/** The value of a `JobDetail` (`components/job-card/Detail.tsx`) within a job card, e.g. "Duration" or "Ended". */
export const jobDetailValue = (card: Locator, label: JobDetailLabel): Locator =>
  card.getByText(`${label}:`, { exact: true }).locator('xpath=following-sibling::span[1]');

/**
 * The status filter's `ToggleGroup` (`components/SearchFilter.tsx`) renders each option as a
 * `role="radio"` button - see `useToggleItem` in `@navikt/ds-react`. Options are labelled with
 * the lowercase status value (e.g. "running"), except the "All" option.
 */
export const statusFilter = (page: Page, label: 'All' | 'running' | 'success' | 'failed' | 'timeout'): Locator =>
  page.getByRole('radio', { name: label, exact: true });

/** The free-text job name filter (`components/SearchFilter.tsx`). */
export const searchInput = (page: Page): Locator => page.getByPlaceholder('Filter jobs by name...');

/** A sort field button (`components/JobsList/Sorting.tsx`), e.g. "Created", "Modified" or "Ended". */
export const sortButton = (page: Page, label: 'Created' | 'Modified' | 'Ended'): Locator =>
  page.getByRole('button', { name: label, exact: true });

/**
 * The job list is rendered as an `<ol>` of `<li>` job cards (`components/JobsList/JobsList.tsx`),
 * so DOM order reflects the current sort order. Returns the visible job cards' text content, in
 * the order they're rendered, to assert on filtering/sorting without relying on any of the
 * individually-hidden accessible state (e.g. sort direction has no accessible affordance).
 */
export const visibleJobCardsText = (page: Page): Promise<Array<string>> => page.locator('ol > li').allTextContents();

/**
 * Retries `interact` (an action immediately followed by an assertion of its effect, e.g. a click
 * followed by an `expect(...).toBeVisible()`) until it passes.
 *
 * Guards against a real race on the first interaction with a freshly loaded page: Next.js
 * streams server-rendered HTML before client-side React hydrates it, so a click performed in
 * that window can land on a plain DOM node with no listener attached yet (silently swallowed),
 * and typing into a not-yet-hydrated *controlled* input can have its value reverted back to
 * React's (unchanged) tracked state once hydration commits - neither is simply "slow", so
 * re-asserting alone wouldn't recover. Retrying the interaction itself does, once hydration has
 * actually finished.
 */
export const retryUntilHydrated = (interact: () => Promise<void>): Promise<void> => expect(interact).toPass();
