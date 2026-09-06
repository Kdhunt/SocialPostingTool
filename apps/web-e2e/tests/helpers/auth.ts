import { expect, type Page } from '@playwright/test';
import type { E2eCredentials } from './env';

async function waitForHydratedLoginForm(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('#username')).toBeEditable();
  await page.waitForFunction(() => {
    const root = document.getElementById('__nuxt');
    return Boolean(root && '__vue_app__' in root);
  });
}

async function fillAndConfirm(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector);
  await expect(field).toBeEditable();
  await field.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(field).toHaveValue(value);
}

export async function fillLoginForm(
  page: Page,
  credentials: { username: string; password: string; wardCode: string },
): Promise<void> {
  await waitForHydratedLoginForm(page);
  await fillAndConfirm(page, '#username', credentials.username);
  await fillAndConfirm(page, '#ward-code', credentials.wardCode);
  await fillAndConfirm(page, '#password', credentials.password);
}

export async function signIn(page: Page, credentials: E2eCredentials): Promise<void> {
  await page.goto('/login');
  await fillLoginForm(page, credentials);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const authenticator = page.getByLabel('Authenticator code');
  const welcome = page.getByRole('heading', { name: /^Welcome/ });
  const alert = page.getByRole('alert');

  await expect(welcome.or(authenticator).or(alert)).toBeVisible({ timeout: 30_000 });

  if (await authenticator.isVisible()) {
    throw new Error('This account requires an authenticator code; E2E login cannot complete MFA.');
  }

  if (await alert.isVisible()) {
    const message = (await alert.textContent())?.trim() ?? 'unknown error';
    if (/invalid username or password/i.test(message)) {
      throw new Error(
        'Sign-in failed: live API rejected E2E_USERNAME/E2E_PASSWORD. Update apps/web-e2e/.env (gitignored) and wait if the account is locked.',
      );
    }
    throw new Error(`Sign-in failed: ${message}`);
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
