import { defineConfig, devices } from '@playwright/test';
import { e2eBaseUrl, isRemoteE2e } from './tests/helpers/env';

const baseURL = e2eBaseUrl();
const remote = isRemoteE2e();

export default defineConfig({
  testDir: './tests',
  testMatch: /auth\.capture\.ts/,
  timeout: 6 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    headless: false,
    ...devices['Desktop Chrome'],
  },
  ...(remote
    ? {}
    : {
        webServer: {
          command: 'pnpm --filter @ward-comms/web dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
