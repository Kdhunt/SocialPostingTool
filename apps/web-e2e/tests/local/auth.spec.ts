import { SUPERADMIN, unitByKey } from '../../mock-ward/fixture';
import {
  createThrowawayUser,
  expect,
  fill,
  heading,
  open,
  primaryNav,
  signInThroughForm,
  test,
  wardUser,
} from './helpers/fixtures';
import { SESSIONS, as } from './helpers/sessions';
import { freshTotpWindow, totpCode } from './helpers/totp';

/**
 * Sign-in, sign-out and two-factor flows. Every form sign-in spends one of
 * the API's per-address login attempts (60 per 15 minutes), so this file
 * signs in only where the sign-in itself is what's being tested.
 */
test.describe('Sign in', () => {
  test('a ward member signs in with the unit code and lands on their home page', async ({
    page,
  }) => {
    const viewer = SESSIONS.viewer;
    await signInThroughForm(page, viewer);
    await expect(page).toHaveURL(/\/$/);
    await heading(page, `Welcome, ${viewer.displayName}`);
    await expect(primaryNav(page).getByText(viewer.displayName)).toBeVisible();
  });

  test('the superadmin signs in with no unit code and sees the platform home', async ({ page }) => {
    await signInThroughForm(page, { username: SUPERADMIN.username, password: SUPERADMIN.password });
    await heading(page, `Welcome, ${SUPERADMIN.displayName}`);
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
  });

  test('a stake administrator signs in with the stake code', async ({ page }) => {
    await signInThroughForm(page, SESSIONS.stakeAdmin);
    await heading(page, `Welcome, ${SESSIONS.stakeAdmin.displayName}`);
    await expect(primaryNav(page).getByRole('link', { name: 'Units' })).toBeVisible();
  });

  test('a wrong password is rejected without saying which part was wrong', async ({ page }) => {
    await signInThroughForm(page, { ...SESSIONS.viewer, password: 'Fictional-Wrong-Pass-1' });
    await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a ward member cannot sign in with another ward’s code', async ({ page }) => {
    await signInThroughForm(page, { ...SESSIONS.viewer, unitCode: unitByKey('otherWard').code });
    await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
  });

  test('a ward member cannot sign in without a unit code', async ({ page }) => {
    await signInThroughForm(page, { ...SESSIONS.viewer, unitCode: undefined });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('a disabled account cannot sign in', async ({ page }) => {
    const disabled = wardUser('disabled');
    await signInThroughForm(page, {
      username: disabled.username,
      password: disabled.password,
      unitCode: unitByKey('ward').code,
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('the unit code is not sent in the address bar or stored in the page', async ({ page }) => {
    await open(page, '/login');
    await fill(page, '#unit-code', unitByKey('ward').code);
    await expect(page.locator('#unit-code')).toHaveAttribute('type', 'password');
    await expect(page.locator('#unit-code')).toHaveAttribute('autocomplete', 'off');
    expect(page.url()).not.toContain(unitByKey('ward').code);
  });
});

test.describe('Sign out', () => {
  test.use(as('wardAdmin'));

  test('signing out from the sidebar ends the session', async ({ browser, api, ward }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signInThroughForm(page, user);
      await heading(page, `Welcome, ${user.displayName}`);
      await primaryNav(page).getByRole('button', { name: 'Sign out' }).click();
      await expect(primaryNav(page).getByRole('button', { name: 'Sign out' })).toHaveCount(0);
      await page.goto('/directory');
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
    }
  });
});

test.describe('Two-factor authentication', () => {
  test.use(as('wardAdmin'));

  test('set up, sign in with a code, reject a wrong code, then turn it off', async ({
    browser,
    api,
    ward,
  }) => {
    test.setTimeout(150_000);
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signInThroughForm(page, user);
      await heading(page, `Welcome, ${user.displayName}`);

      await open(page, '/settings/security');
      await heading(page, 'Security');
      await page.getByRole('button', { name: 'Set up authenticator app' }).click();
      await expect(
        page.getByRole('heading', { name: 'Scan or enter your setup key' }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open in authenticator app' })).toHaveAttribute(
        'href',
        /^otpauth:\/\//,
      );
      const secret = (await page.locator('code').first().textContent())?.trim() ?? '';
      expect(secret.length).toBeGreaterThan(10);

      await fill(page, '#confirm-totp', '000000');
      await page.getByRole('button', { name: 'Confirm and enable' }).click();
      await expect(
        page.getByRole('alert').filter({ hasText: 'Incorrect authenticator code.' }),
      ).toBeVisible();

      await freshTotpWindow();
      await fill(page, '#confirm-totp', totpCode(secret));
      await page.getByRole('button', { name: 'Confirm and enable' }).click();
      // Turning on 2FA signs every session out.
      await expect(page).toHaveURL(/\/login/);

      await signInThroughForm(page, user);
      await expect(page.getByLabel('Authenticator code')).toBeVisible();
      await fill(page, '#totp-code', '123456');
      await page.getByRole('button', { name: 'Verify code' }).click();
      await expect(
        page.getByRole('alert').filter({ hasText: 'Incorrect authenticator code.' }),
      ).toBeVisible();

      await freshTotpWindow();
      await fill(page, '#totp-code', totpCode(secret));
      await page.getByRole('button', { name: 'Verify code' }).click();
      await heading(page, `Welcome, ${user.displayName}`);

      await open(page, '/settings/security');
      await expect(
        page.getByRole('heading', { name: 'Two-factor authentication is on' }),
      ).toBeVisible();
      await fill(page, '#disable-password', 'Fictional-Not-The-Password-1');
      await freshTotpWindow();
      await fill(page, '#disable-totp', totpCode(secret));
      await page.getByRole('button', { name: 'Disable two-factor authentication' }).click();
      await expect(
        page.getByRole('alert').filter({ hasText: 'Incorrect password.' }),
      ).toBeVisible();

      await fill(page, '#disable-password', user.password);
      await freshTotpWindow();
      await fill(page, '#disable-totp', totpCode(secret));
      await page.getByRole('button', { name: 'Disable two-factor authentication' }).click();
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
    }
  });
});

test.describe('Two-factor replay protection', () => {
  test.use(as('wardAdmin'));

  test('an authenticator code cannot be used twice (RFC 6238 §5.2)', async ({
    api,
    ward,
    anonymousApi,
  }) => {
    test.fail(
      true,
      'Known gap: verifyTotpCode accepts the same code again inside its ±30s window.',
    );
    test.setTimeout(120_000);
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const login = async (): Promise<{
      status: string;
      loginTicket?: string;
      tokens?: { accessToken: string };
    }> =>
      (
        await anonymousApi.post('/auth/login', {
          data: {
            username: user.username,
            password: user.password,
            unitCode: user.unitCode,
            clientType: 'mobile',
          },
        })
      ).json() as Promise<{
        status: string;
        loginTicket?: string;
        tokens?: { accessToken: string };
      }>;

    const first = await login();
    const bearer = { Authorization: `Bearer ${first.tokens?.accessToken ?? ''}` };
    const enrollment = (await (
      await anonymousApi.post('/auth/totp/enroll', { headers: bearer })
    ).json()) as { secret: string };
    await freshTotpWindow(20_000);
    const code = totpCode(enrollment.secret);
    expect(
      (await anonymousApi.post('/auth/totp/confirm', { headers: bearer, data: { code } })).ok(),
    ).toBe(true);

    const second = await login();
    expect(second.status).toBe('totp_required');
    const replay = await anonymousApi.post('/auth/totp', {
      data: { loginTicket: second.loginTicket, code, clientType: 'mobile' },
    });
    expect(replay.status()).toBe(401);
  });
});
