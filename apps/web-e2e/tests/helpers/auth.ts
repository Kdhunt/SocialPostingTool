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

function assertFilledLength(selector: string, actualLength: number, expectedLength: number): void {
  if (actualLength !== expectedLength) {
    throw new Error(
      `${selector} did not keep the typed value (length ${actualLength}, expected ${expectedLength}).`,
    );
  }
}

async function fillField(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector);
  await expect(field).toBeEditable();
  await field.evaluate((element) => {
    element.setAttribute('autocomplete', 'off');
  });
  await field.fill(value);
  await field.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    if (input.value.length === nextValue.length) {
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  assertFilledLength(selector, (await field.inputValue()).length, value.length);
}

export async function fillLoginForm(
  page: Page,
  credentials: { username: string; password: string; wardCode: string },
): Promise<void> {
  await waitForHydratedLoginForm(page);
  await fillField(page, '#username', credentials.username);
  await fillField(page, '#password', credentials.password);
  await fillField(page, '#ward-code', credentials.wardCode.trim());
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
    if (/temporarily locked|too many sign-in attempts/i.test(message)) {
      throw new Error('Sign-in stopped: live account is locked. Not retrying.');
    }

    const wardBindingMiss =
      /incorrect ward code|enter the ward code to finish/i.test(message) && (await page.locator('#ward-code').isVisible());
    if (wardBindingMiss) {
      await fillField(page, '#ward-code', credentials.wardCode.trim());
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(welcome.or(authenticator).or(alert)).toBeVisible({ timeout: 30_000 });
      if (await authenticator.isVisible()) {
        throw new Error('This account requires an authenticator code; E2E login cannot complete MFA.');
      }
      if (await welcome.isVisible()) {
        await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
        return;
      }
      const retryMessage = (await alert.textContent())?.trim() ?? 'unknown error';
      if (/temporarily locked|too many sign-in attempts/i.test(retryMessage)) {
        throw new Error('Sign-in stopped: live account is locked. Not retrying.');
      }
      if (/incorrect ward code/i.test(retryMessage)) {
        throw new Error(
          'Sign-in failed: live API rejected E2E_WARD_CODE after a second ward-code submit. Not retrying.',
        );
      }
      throw new Error(`Sign-in failed: ${retryMessage}`);
    }

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

function apiErrorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return '';
}

export async function signInViaApi(page: Page, credentials: E2eCredentials): Promise<void> {
  await page.goto('/login');
  await waitForHydratedLoginForm(page);

  const loginResponse = await page.request.post('/api/v1/auth/login', {
    data: {
      username: credentials.username,
      password: credentials.password,
      clientType: 'web',
    },
  });
  const loginBody: unknown = await loginResponse.json().catch(() => null);
  const loginMessage = apiErrorMessage(loginBody);

  if (loginResponse.status() === 403 || /locked|too many/i.test(loginMessage)) {
    throw new Error('Sign-in stopped: live account is locked. Not retrying.');
  }
  if (!loginResponse.ok()) {
    throw new Error(`API sign-in failed with HTTP ${loginResponse.status()}.`);
  }

  const status =
    loginBody && typeof loginBody === 'object' && 'status' in loginBody && typeof loginBody.status === 'string'
      ? loginBody.status
      : '';

  if (status === 'totp_required') {
    throw new Error('This account requires an authenticator code; E2E login cannot complete MFA.');
  }

  if (status === 'ward_code_required') {
    const loginTicket =
      loginBody && typeof loginBody === 'object' && 'loginTicket' in loginBody && typeof loginBody.loginTicket === 'string'
        ? loginBody.loginTicket
        : '';
    const wardResponse = await page.request.post('/api/v1/auth/ward-code', {
      data: {
        loginTicket,
        wardCode: credentials.wardCode.trim(),
        clientType: 'web',
      },
    });
    const wardBody: unknown = await wardResponse.json().catch(() => null);
    const wardMessage = apiErrorMessage(wardBody);
    if (wardResponse.status() === 403 || /locked|too many/i.test(wardMessage)) {
      throw new Error('Sign-in stopped: live account is locked. Not retrying.');
    }
    if (!wardResponse.ok()) {
      throw new Error(
        `API ward-code step failed with HTTP ${wardResponse.status()}${wardMessage ? `: ${wardMessage}` : ''}.`,
      );
    }
  }

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

export async function expectPageHeading(page: Page, name: string | RegExp): Promise<void> {
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 20_000 });
}

export function primaryNav(page: Page) {
  return page.getByRole('complementary', { name: 'Primary' });
}
