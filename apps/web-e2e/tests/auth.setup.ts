import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { signIn } from './helpers/auth';
import { authStatePath, e2eCredentials, missingCredentialsMessage } from './helpers/env';

setup('authenticate', async ({ page }) => {
  const credentials = e2eCredentials();
  setup.skip(!credentials, missingCredentialsMessage);
  if (!credentials) {
    return;
  }

  mkdirSync(path.dirname(authStatePath), { recursive: true });
  await signIn(page, credentials);
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  await page.context().storageState({ path: authStatePath });
});
