import {
  createThrowawayUser,
  expect,
  fill,
  heading,
  open,
  signInThroughForm,
  test,
  unique,
} from './helpers/fixtures';
import { CONFIRM_SUBJECT, latestEmail, linkFromEmail } from './helpers/inbox';
import { SESSIONS, as } from './helpers/sessions';

test.describe('Account settings (read-only checks)', () => {
  test.use(as('viewer'));

  test('shows who is signed in, email status and links to security', async ({ page }) => {
    await open(page, '/settings/account');
    await heading(page, 'Account');
    await expect(
      page.getByText(`Signed in as ${SESSIONS.viewer.displayName} (@${SESSIONS.viewer.username}).`),
    ).toBeVisible();
    await expect(page.getByText('Email unconfirmed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend confirmation email' })).toBeVisible();
    await expect(page.locator('#account-email')).toHaveValue('viewer@maplehollow.example.test');
    await page.getByRole('link', { name: 'Two-factor authentication' }).click();
    await heading(page, 'Security');
    await expect(page.getByRole('button', { name: 'Set up authenticator app' })).toBeVisible();
    await page.getByRole('link', { name: 'Change email or password' }).click();
    await heading(page, 'Account');
  });

  test('client-side checks catch a bad email and a short password before saving', async ({
    page,
  }) => {
    await open(page, '/settings/account');
    await fill(page, '#account-email', 'not-an-email');
    await page.getByRole('button', { name: 'Update email' }).click();
    await expect(page.locator('#account-email')).toHaveAttribute('aria-invalid', 'true');

    await fill(page, '#current-password', 'anything');
    await fill(page, '#new-password', 'short');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.locator('#new-password')).toHaveAttribute('aria-invalid', 'true');
    await heading(page, 'Account');
  });
});

test.describe('Account changes', () => {
  test.use(as('wardAdmin'));

  test('change email, confirm it from the inbox, then change password and sign in with it', async ({
    browser,
    api,
    ward,
  }) => {
    test.setTimeout(120_000);
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signInThroughForm(page, user);
      await heading(page, `Welcome, ${user.displayName}`);
      await open(page, '/settings/account');

      const resendSince = new Date();
      await page.getByRole('button', { name: 'Resend confirmation email' }).click();
      await expect(page.getByText('A confirmation email was queued for your inbox.')).toBeVisible();
      await latestEmail(user.email, CONFIRM_SUBJECT, resendSince);

      const newEmail = `moved.${unique()}@maplehollow.example.test`;
      const since = new Date();
      await fill(page, '#account-email', newEmail);
      await page.getByRole('button', { name: 'Update email' }).click();
      await expect(page.locator('.account-section__email')).toHaveText(newEmail);
      await expect(page.getByText('Email unconfirmed')).toBeVisible();

      const email = await latestEmail(newEmail, CONFIRM_SUBJECT, since);
      await open(page, linkFromEmail(email, '/verify-email'));
      await expect(page.getByText(/confirmed/i)).toBeVisible();
      await open(page, '/settings/account');
      await expect(page.getByText('Email confirmed')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Resend confirmation email' })).toHaveCount(0);

      await fill(page, '#current-password', 'Fictional-Wrong-Current-1');
      await fill(page, '#new-password', 'Fictional-Brand-New-42');
      await page.getByRole('button', { name: 'Update password' }).click();
      await expect(page.getByRole('alert')).toContainText('Incorrect current password.');

      await fill(page, '#current-password', user.password);
      await fill(page, '#new-password', user.password);
      await page.getByRole('button', { name: 'Update password' }).click();
      await expect(page.getByRole('alert')).toContainText('different from your current password');

      await fill(page, '#current-password', user.password);
      await fill(page, '#new-password', 'Fictional-Brand-New-42');
      await page.getByRole('button', { name: 'Update password' }).click();
      await expect(page).toHaveURL(/\/login/);

      await signInThroughForm(page, { ...user, password: 'Fictional-Brand-New-42' });
      await heading(page, `Welcome, ${user.displayName}`);
    } finally {
      await context.close();
    }
  });

  test('an email already used by someone else in the ward is refused', async ({
    api,
    ward,
    anonymousApi,
  }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const login = await anonymousApi.post('/auth/login', {
      data: {
        username: user.username,
        password: user.password,
        unitCode: user.unitCode,
        clientType: 'mobile',
      },
    });
    const token = ((await login.json()) as { tokens: { accessToken: string } }).tokens.accessToken;
    const response = await anonymousApi.patch('/auth/email', {
      headers: { Authorization: `Bearer ${token}` },
      data: { email: 'viewer@maplehollow.example.test' },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
