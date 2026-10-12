import { defineConfig, devices } from '@playwright/test';

const baseURL = `http://127.0.0.1:${process.env.JIO_E2E_PORT || '3210'}`;
const externallyManagedServer = process.env.JIO_E2E_MANAGED_SERVER === '1';

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: externallyManagedServer ? undefined : {
    command: 'node tests/e2e/start-isolated-next.mjs',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
