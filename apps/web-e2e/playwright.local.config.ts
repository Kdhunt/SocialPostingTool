import { defineConfig, devices } from '@playwright/test';
import {
  applyLocalE2eEnv,
  localApiUrl,
  localWebUrl,
  LOCAL_E2E_SMTP_PORT,
  LOCAL_E2E_WEB_PORT,
} from './mock-ward/env';

/**
 * Full local suite against a disposable stack and the fictional mock ward.
 *
 *   docker compose up -d postgres redis      # once
 *   pnpm --filter @ward-comms/web-e2e test:e2e:local
 *
 * Starts a local mail catcher (port 2525), its own API (port 3101, after resetting the ward_comms_e2e
 * database) and Nuxt (port 3100), builds the mock ward through the API in
 * global setup, then signs in once per role. Nothing here talks to a
 * deployed site or a real provider: email, SMS and Facebook run simulated.
 */
const env = applyLocalE2eEnv();

export default defineConfig({
  testDir: './tests/local',
  globalSetup: './mock-ward/global-setup.ts',
  fullyParallel: true,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: localWebUrl,
    timezoneId: 'America/Denver',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'sessions', testMatch: /sessions\.setup\.ts/ },
    {
      name: 'local',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['sessions'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Local SMTP sink: account emails land here instead of a real mailbox.
      command: 'pnpm exec tsx mock-ward/mail-catcher.ts',
      port: LOCAL_E2E_SMTP_PORT,
      env: env as Record<string, string>,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Reset first so the API boots against a clean schema and empty rate-limit windows.
      command: 'pnpm exec tsx mock-ward/reset-db.ts && pnpm exec tsx mock-ward/start-api.ts',
      url: `${localApiUrl}/health`,
      env: env as Record<string, string>,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `pnpm --filter @ward-comms/web exec nuxt dev --port ${LOCAL_E2E_WEB_PORT}`,
      url: localWebUrl,
      env: env as Record<string, string>,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
