import { defineConfig, devices } from '@playwright/test';
import {
  authStatePath,
  e2eBaseUrl,
  e2eCredentials,
  hasStoredAuthState,
  isRemoteE2e,
} from './tests/helpers/env';

const baseURL = e2eBaseUrl();
const remote = isRemoteE2e();
const credentials = e2eCredentials();
const storedAuth = hasStoredAuthState();
const canAuthenticate = Boolean(credentials || storedAuth);

export default defineConfig({
  testDir: './tests',
  testIgnore: /auth\.capture\.ts/,
  fullyParallel: !remote,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI || remote ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--disable-save-password-bubble', '--disable-features=PasswordManagerOnboarding'],
    },
  },
  projects: [
    {
      name: 'guest',
      testMatch: /smoke\.spec\.ts|login\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    ...(canAuthenticate
      ? [
          { name: 'setup', testMatch: /auth\.setup\.ts/ },
          {
            name: 'authenticated',
            testMatch: /authenticated\.spec\.ts|full-site\.spec\.ts/,
            dependencies: ['setup'],
            use: {
              ...devices['Desktop Chrome'],
              storageState: authStatePath,
            },
          },
        ]
      : []),
  ],
  ...(remote
    ? {}
    : {
        webServer: {
          command: 'pnpm --filter @ward-comms/web dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
