import { test, expect } from '@playwright/test';

test.describe('Ward Communications Hub smoke', () => {
  test('health page loads and shows the app title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ward Communications Hub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('campaigns index redirects anonymous users to login', async ({ page }) => {
    await page.goto('/campaigns');
    await expect(page).toHaveURL(/\/login/);
  });
});
