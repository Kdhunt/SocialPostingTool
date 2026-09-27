import { test, expect } from '@playwright/test';
import { expectPageHeading, isPlatformOperatorNav, primaryNav } from './helpers/auth';

test.describe('Authenticated platform operator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    test.skip(!(await isPlatformOperatorNav(page)), 'Signed in as a ward operator.');
  });

  test('home is ward setup, not the member workspace', async ({ page }) => {
    await expectPageHeading(page, /^Welcome/);
    await expect(page.getByRole('heading', { name: 'Wards' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Directory' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recent campaigns' })).toHaveCount(0);
    await expect(primaryNav(page).getByRole('link', { name: 'People' })).toHaveCount(0);
    await expect(primaryNav(page).getByRole('link', { name: 'Campaigns' })).toHaveCount(0);
  });

  test('account and security remain available', async ({ page }) => {
    await page.goto('/settings/account');
    await expectPageHeading(page, 'Account');
    await page.goto('/settings/security');
    await expectPageHeading(page, 'Security');
  });

  test('wards administration loads', async ({ page }) => {
    await page.goto('/admin/wards');
    await expectPageHeading(page, 'Wards');
    await expect(page.getByRole('button', { name: 'New ward' })).toBeVisible();
  });
});

test.describe('Authenticated ward workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    test.skip(await isPlatformOperatorNav(page), 'Signed in as the platform operator.');
  });

  test('home dashboard shows welcome and quick actions', async ({ page }) => {
    await expectPageHeading(page, /^Welcome/);
    await expect(page.getByRole('heading', { name: 'Directory' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent campaigns' })).toBeVisible();
  });

  test('directory people page loads', async ({ page }) => {
    await page.goto('/directory');
    await expectPageHeading(page, 'Directory');
    await expect(page.getByLabel('Search by name')).toBeVisible();
  });

  test('households page loads', async ({ page }) => {
    await page.goto('/directory/households');
    await expectPageHeading(page, 'Households');
  });

  test('campaigns page loads', async ({ page }) => {
    await page.goto('/campaigns');
    await expectPageHeading(page, 'Campaigns');
  });

  test('audiences page loads', async ({ page }) => {
    await page.goto('/audiences');
    await expectPageHeading(page, 'Audiences');
  });

  test('destinations page loads', async ({ page }) => {
    await page.goto('/audiences/destinations');
    await expectPageHeading(page, 'Communication destinations');
  });

  test('account settings page loads', async ({ page }) => {
    await page.goto('/settings/account');
    await expectPageHeading(page, 'Account');
    await expect(page.getByRole('heading', { name: 'Email status' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Change email' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
    if (await page.getByText('Email unconfirmed').isVisible()) {
      await expect(page.getByRole('button', { name: 'Resend confirmation email' })).toBeVisible();
    }
  });

  test('security settings page loads', async ({ page }) => {
    await page.goto('/settings/security');
    await expectPageHeading(page, 'Security');
  });

  test('admin users page loads for a ward admin', async ({ page }) => {
    await page.goto('/admin/users');
    await expectPageHeading(page, 'User management');
  });

  test('admin ward code page loads for a ward admin', async ({ page }) => {
    await page.goto('/admin/ward-code');
    await expectPageHeading(page, 'Ward code');
    await expect(page.getByRole('heading', { name: 'Rotate ward code' })).toBeVisible();
  });

  test('admin providers page loads when permitted', async ({ page }) => {
    await page.goto('/admin/provider-credentials');
    await expectPageHeading(page, 'Provider credentials');
  });

  test('admin facebook page settings load when permitted', async ({ page }) => {
    await page.goto('/admin/facebook-page');
    await expectPageHeading(page, 'Facebook Page');
  });

  test('admin audit log loads when permitted', async ({ page }) => {
    await page.goto('/admin/audit');
    await expectPageHeading(page, 'Audit log');
  });

  test('primary navigation reaches core sections', async ({ page }) => {
    const nav = primaryNav(page);

    await nav.getByRole('link', { name: 'People' }).click();
    await expectPageHeading(page, 'Directory');

    await nav.getByRole('link', { name: 'Campaigns' }).click();
    await expectPageHeading(page, 'Campaigns');

    await nav.getByRole('link', { name: 'Audiences' }).click();
    await expectPageHeading(page, 'Audiences');

    await nav.getByRole('link', { name: 'Home' }).click();
    await expectPageHeading(page, /^Welcome/);
  });
});
