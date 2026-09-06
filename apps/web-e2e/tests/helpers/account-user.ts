import { expect, type Page } from '@playwright/test';
import { expectPageHeading, fillHydratedInput } from './auth';

export function fictionalSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const fictionalUserPassword = 'Fictional-User-42';
export const fictionalResetPassword = 'Fictional-Reset-42';

export async function createFictionalViewer(
  page: Page,
  input: { username: string; email: string; displayName: string; password?: string },
): Promise<void> {
  await page.goto('/admin/users');
  await expectPageHeading(page, 'User management');
  await fillHydratedInput(page, '#new-username', input.username);
  await fillHydratedInput(page, '#new-email', input.email);
  await fillHydratedInput(page, '#new-display-name', input.displayName);
  await fillHydratedInput(page, '#new-password', input.password ?? fictionalUserPassword);
  const viewer = page.getByRole('checkbox', { name: 'Viewer' });
  await expect(viewer).toBeVisible();
  await viewer.check();
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByText(`@${input.username}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/confirmation email was queued/i)).toBeVisible();
}

export function userRow(page: Page, username: string) {
  return page.locator('li', { hasText: `@${username}` });
}

export async function disableFictionalUser(page: Page, username: string): Promise<void> {
  await page.goto('/admin/users');
  await expectPageHeading(page, 'User management');
  const row = userRow(page, username);
  await expect(row).toBeVisible();
  if (await row.getByText('Disabled').isVisible().catch(() => false)) {
    return;
  }
  await row.getByRole('button', { name: 'Disable' }).click();
  await expect(row.getByText('Disabled')).toBeVisible({ timeout: 20_000 });
}
