import { test, expect } from '@playwright/test';
import { fillHydratedInput, waitForNuxtApp } from './helpers/auth';

test.describe('Ward Communications Hub smoke', () => {
  test('anonymous visitors are sent to sign in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Ward Communications Hub')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByLabel(/ward code/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('login page links to forgot password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email reset link' })).toBeVisible();
  });

  test('forgot password accepts an email without revealing whether it exists', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await waitForNuxtApp(page);
    await fillHydratedInput(page, '#reset-email', 'nobody-e2e@mailinator.com');
    await page.getByRole('button', { name: 'Email reset link' }).click();
    await expect(page.getByText(/if an account exists|unable to send|too many/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test('verify-email without a token explains how to continue', async ({ page }) => {
    await page.goto('/verify-email');
    await expect(page.getByRole('heading', { name: 'Confirm email' })).toBeVisible();
    await expect(page.getByText(/missing a token/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue to sign in' })).toBeVisible();
  });

  test('campaigns index redirects anonymous users to login', async ({ page }) => {
    await page.goto('/campaigns');
    await expect(page).toHaveURL(/\/login/);
  });
});
