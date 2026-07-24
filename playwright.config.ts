import { defineConfig } from '@playwright/test';

const PORT = 3210;

/**
 * The Valkey container and connection env vars (`REDIS_URI_KLAGE_JOB_STATUS`, `API_KEY_SECRET`,
 * etc.) are set up by `e2e/run.ts`, which spawns `playwright test` as a child process - see that
 * file for why this isn't done here instead. `webServer.command` below inherits them since
 * Playwright passes the current `process.env` through to the command it spawns.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI !== undefined ? 2 : 0,
  reporter: process.env.CI !== undefined ? 'github' : 'list',
  // `next dev` compiles each route on first request, which can comfortably take a few seconds
  // longer than Playwright's 5s default `expect` timeout - bump it so a cold route doesn't
  // flake the first test(s) to hit it.
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `bun run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/isAlive`,
    reuseExistingServer: process.env.CI === undefined,
    stdout: 'pipe',
    timeout: 60_000,
  },
});
