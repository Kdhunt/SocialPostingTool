import { test, expect } from '@playwright/test';
import { fillLoginForm, primaryNav, signIn } from './helpers/auth';
import { e2eCredentials, missingCredentialsMessage } from './helpers/env';

test.describe('Login', () => {
  test('shows an error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await fillLoginForm(page, {
      username: 'not-a-real-user',
      password: 'definitely-wrong-password',
      wardCode: 'not-the-ward-code',
    });
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('signs in with configured ward admin credentials', async ({ page }) => {
    const credentials = e2eCredentials();
    test.skip(!credentials, missingCredentialsMessage);
    if (!credentials) {
      return;
    }

    await signIn(page, credentials);
    await expect(primaryNav(page)).toBeVisible();
    await expect(primaryNav(page).getByRole('link', { name: 'People' })).toBeVisible();
    await expect(primaryNav(page).getByRole('link', { name: 'Campaigns' })).toBeVisible();
  });
});
