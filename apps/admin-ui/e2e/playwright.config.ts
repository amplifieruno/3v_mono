import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the dev stack (Hasura :8080, auth :4100, seed data)
 * through the Vite dev server. `127.0.0.1`, not `localhost`: the dev server
 * binds IPv4 only, and another process may own `[::1]:5173`.
 */
const BASE_URL = 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: '.',
  globalSetup: './global-setup.ts',
  outputDir: '../test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    cwd: '..',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
