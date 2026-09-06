import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { signInViaApi } from './helpers/auth';
import {
  authStatePath,
  e2eCredentials,
  hasStoredAuthState,
  missingCredentialsMessage,
} from './helpers/env';

setup('authenticate', async ({ page }) => {
  mkdirSync(path.dirname(authStatePath), { recursive: true });

  if (hasStoredAuthState()) {
    return;
  }

  const credentials = e2eCredentials();
  setup.skip(!credentials, missingCredentialsMessage);
  if (!credentials) {
    return;
  }

  await signInViaApi(page, credentials);
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  await page.context().storageState({ path: authStatePath });
});
