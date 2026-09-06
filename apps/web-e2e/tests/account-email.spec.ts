import { test, expect } from '@playwright/test';
import {
  createFictionalViewer,
  disableFictionalUser,
  fictionalResetPassword,
  fictionalSuffix,
  fictionalUserPassword,
  userRow,
} from './helpers/account-user';
import { fillHydratedInput, fillLoginForm, waitForNuxtApp } from './helpers/auth';
import { e2eWardCode, isLiveAccountEmailE2e } from './helpers/env';
import { appUrlFromEmailedLink, fictionalMailinatorInbox, waitForMailinatorLink } from './helpers/mailinator';

/**
 * Live account-email walks using public Mailinator inboxes.
 * Fictional users only. Does not rotate the signed-in admin password or ward code.
 */
test.describe('Account email — Mailinator', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !isLiveAccountEmailE2e(),
      'Set E2E_BASE_URL to the deployed site, or E2E_LIVE_EMAIL=1 when the host sends live mail.',
    );
    testInfo.setTimeout(120_000);
  });

  test('create user queues a confirmation email that verifies the inbox', async ({ page, browser }) => {
    const suffix = fictionalSuffix();
    const username = `fic.mail.${suffix}`;
    const inbox = fictionalMailinatorInbox(suffix);
    const displayName = `Fictional Mail ${suffix}`;

    await createFictionalViewer(page, {
      username,
      email: inbox.address,
      displayName,
    });
    await expect(userRow(page, username).getByText('Email unconfirmed')).toBeVisible();

    const emailedUrl = await waitForMailinatorLink(browser, {
      localPart: inbox.localPart,
      subject: /Confirm your .* email/i,
      path: 'verify-email',
    });
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    try {
      await guestPage.goto(appUrlFromEmailedLink(emailedUrl));
      await expect(guestPage.getByRole('heading', { name: 'Confirm email' })).toBeVisible();
      await expect(guestPage.getByText('Your email address is confirmed.')).toBeVisible({ timeout: 20_000 });
    } finally {
      await guest.close();
    }

    await page.reload();
    await expect(userRow(page, username).getByText('Email confirmed')).toBeVisible({ timeout: 20_000 });
    await disableFictionalUser(page, username);
  });

  test('admin email-reset link lets the user choose a new password', async ({ page, browser }) => {
    const suffix = fictionalSuffix();
    const username = `fic.reset.${suffix}`;
    const inbox = fictionalMailinatorInbox(`r${suffix}`);
    const displayName = `Fictional Reset ${suffix}`;

    await createFictionalViewer(page, {
      username,
      email: inbox.address,
      displayName,
      password: fictionalUserPassword,
    });

    const row = userRow(page, username);
    await row.getByRole('button', { name: 'Email reset link' }).click();
    await expect(page.getByText(new RegExp(`password reset email was queued for ${inbox.address}`, 'i'))).toBeVisible({
      timeout: 20_000,
    });

    const emailedUrl = await waitForMailinatorLink(browser, {
      localPart: inbox.localPart,
      subject: /Reset your .* password/i,
      path: 'reset-password',
    });

    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    try {
      await guestPage.goto(appUrlFromEmailedLink(emailedUrl));
      await expect(guestPage.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
      await waitForNuxtApp(guestPage);
      await fillHydratedInput(guestPage, '#new-password', fictionalResetPassword);
      await fillHydratedInput(guestPage, '#confirm-password', fictionalResetPassword);
      await guestPage.getByRole('button', { name: 'Update password' }).click();
      await expect(
        guestPage.getByText('Your password has been updated. You can sign in with the new password.'),
      ).toBeVisible({ timeout: 20_000 });

      const wardCode = e2eWardCode();
      if (wardCode) {
        await guestPage.goto('/login');
        await fillLoginForm(guestPage, {
          username,
          password: fictionalResetPassword,
          wardCode,
        });
        await guestPage.getByRole('button', { name: 'Sign in' }).click();
        await expect(guestPage.getByRole('heading', { name: /^Welcome/ })).toBeVisible({ timeout: 30_000 });
        await expect(guestPage.getByRole('button', { name: 'Sign out' })).toBeVisible();
      }
    } finally {
      await guest.close();
    }

    await disableFictionalUser(page, username);
  });
});
