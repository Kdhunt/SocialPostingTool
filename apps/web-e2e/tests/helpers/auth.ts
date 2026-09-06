import { expect, type Page } from '@playwright/test';
import type { E2eCredentials } from './env';

export async function signIn(page: Page, credentials: E2eCredentials): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Username').fill(credentials.username);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByLabel('Ward code').fill(credentials.wardCode);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const authenticator = page.getByLabel('Authenticator code');
  const welcome = page.getByRole('heading', { name: /^Welcome/ });
  const alert = page.getByRole('alert');

  await expect(welcome.or(authenticator).or(alert)).toBeVisible({ timeout: 30_000 });

  if (await authenticator.isVisible()) {
    throw new Error('This account requires an authenticator code; E2E login cannot complete MFA.');
  }

  if (await alert.isVisible()) {
    throw new Error(`Sign-in failed: ${(await alert.textContent())?.trim() ?? 'unknown error'}`);
  }

  await expect(welcome).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

export async function expectPageHeading(page: Page, name: string | RegExp): Promise<void> {
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 20_000 });
}

export function primaryNav(page: Page) {
  return page.getByRole('complementary', { name: 'Primary' });
}
