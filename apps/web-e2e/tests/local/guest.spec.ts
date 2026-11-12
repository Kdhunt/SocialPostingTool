import { BULLETIN, UNITS, unitByKey } from '../../mock-ward/fixture';
import {
  createThrowawayUser,
  expect,
  fill,
  heading,
  open,
  signInThroughForm,
  test,
} from './helpers/fixtures';
import { CONFIRM_SUBJECT, RESET_SUBJECT, latestEmail, linkFromEmail } from './helpers/inbox';
import { as } from './helpers/sessions';

const PROTECTED_PATHS = [
  '/',
  '/directory',
  '/directory/people/new',
  '/directory/households',
  '/directory/households/new',
  '/campaigns',
  '/campaigns/new',
  '/bulletins',
  '/audiences',
  '/audiences/new',
  '/audiences/destinations',
  '/settings/account',
  '/settings/security',
];

test.describe('Guest pages', () => {
  for (const path of PROTECTED_PATHS) {
    test(`anonymous visit to ${path} redirects to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await heading(page, 'Sign in');
    });
  }

  test('login page shows every field, hint and the forgot-password link', async ({ page }) => {
    await open(page, '/login');
    await heading(page, 'Sign in');
    await expect(page.getByLabel('Unit code')).toHaveAttribute('type', 'password');
    await expect(page.getByText('Superadmin leaves this blank.')).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await heading(page, 'Reset your password');
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('forgot password always answers the same way for unknown addresses', async ({ page }) => {
    await open(page, '/forgot-password');
    await fill(page, '#reset-email', 'nobody.at.all@example.test');
    await page.getByRole('button', { name: 'Email reset link' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).not.toContainText(/not found|no account/i);
  });

  test('reset-password page validates before calling the API', async ({ page }) => {
    await open(page, '/reset-password');
    await fill(page, '#new-password', 'Fictional-Long-Pass-1');
    await fill(page, '#confirm-password', 'Fictional-Long-Pass-1');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('alert')).toContainText('missing a token');

    await open(page, '/reset-password?token=not-a-real-token');
    await fill(page, '#new-password', 'Fictional-Long-Pass-1');
    await fill(page, '#confirm-password', 'Fictional-Different-1');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('alert')).toContainText('do not match');

    await fill(page, '#new-password', 'short');
    await fill(page, '#confirm-password', 'short');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await fill(page, '#new-password', 'Fictional-Long-Pass-1');
    await fill(page, '#confirm-password', 'Fictional-Long-Pass-1');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('alert')).toContainText(/invalid|expired/i);
  });

  test('verify-email handles a missing and an invalid token', async ({ page }) => {
    await open(page, '/verify-email');
    await expect(page.getByRole('alert')).toContainText('missing a token');
    await open(page, '/verify-email?token=not-a-real-token');
    await expect(page.getByRole('alert')).toContainText(/invalid|expired/i);
    await page.getByRole('link', { name: 'Continue to sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Password reset and email confirmation by email link', () => {
  test.use(as('wardAdmin'));

  test('a member resets a forgotten password from the emailed link and signs in with it', async ({
    browser,
    api,
    ward,
  }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    try {
      const since = new Date();
      await open(guestPage, '/forgot-password');
      await fill(guestPage, '#reset-email', user.email);
      await guestPage.getByRole('button', { name: 'Email reset link' }).click();
      await expect(guestPage.getByRole('alert')).toBeVisible();

      const email = await latestEmail(user.email, RESET_SUBJECT, since);
      expect(email.body).not.toContain(user.password);
      await open(guestPage, linkFromEmail(email, '/reset-password'));
      await heading(guestPage, 'Choose a new password');
      const newPassword = 'Fictional-Reset-Pass-77';
      await fill(guestPage, '#new-password', newPassword);
      await fill(guestPage, '#confirm-password', newPassword);
      await guestPage.getByRole('button', { name: 'Update password' }).click();
      await expect(guestPage.getByText(/password has been updated/i)).toBeVisible();

      // The link is single use.
      await open(guestPage, linkFromEmail(email, '/reset-password'));
      await fill(guestPage, '#new-password', 'Fictional-Second-Try-1');
      await fill(guestPage, '#confirm-password', 'Fictional-Second-Try-1');
      await guestPage.getByRole('button', { name: 'Update password' }).click();
      await expect(guestPage.getByRole('alert')).toContainText(/invalid|expired/i);

      await signInThroughForm(guestPage, {
        username: user.username,
        password: newPassword,
        unitCode: user.unitCode,
      });
      await heading(guestPage, `Welcome, ${user.displayName}`);
    } finally {
      await guest.close();
    }
  });

  test('a new account confirms its email from the emailed link', async ({ browser, api, ward }) => {
    const since = new Date();
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const email = await latestEmail(user.email, CONFIRM_SUBJECT, since);
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    try {
      await open(guestPage, linkFromEmail(email, '/verify-email'));
      await heading(guestPage, 'Confirm email');
      await expect(guestPage.getByText(/confirmed/i)).toBeVisible();
    } finally {
      await guest.close();
    }
    const admin = await api('wardAdmin');
    const users = (await (await admin.get('/users')).json()) as {
      users: Array<{ id: string; emailVerifiedAt: string | null }>;
    };
    expect(users.users.find((candidate) => candidate.id === user.id)?.emailVerifiedAt).toBeTruthy();
  });
});

test.describe('Public unit pages', () => {
  const ward = unitByKey('ward');

  test('each unit in the hierarchy has a public page', async ({ page }) => {
    for (const unit of UNITS) {
      await open(page, `/${unit.publicSlug}`);
      await heading(page, unit.name);
    }
  });

  test('the ward page lists published bulletins and sent campaigns but no drafts', async ({
    page,
  }) => {
    await open(page, `/${ward.publicSlug}`);
    await heading(page, ward.name);
    const bulletins = page.getByRole('region', { name: 'Bulletins' });
    await expect(bulletins.getByRole('link', { name: BULLETIN.title })).toBeVisible();
    await expect(bulletins.getByRole('link', { name: BULLETIN.spanishTitle })).toBeVisible();
    await expect(page.getByText(BULLETIN.draftTitle)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Fictional Welcome New Families' }),
    ).toBeVisible();
    await expect(page.getByText('Fictional Ward Picnic')).toHaveCount(0);
    await expect(page.getByText(/@example\.test|555-01/)).toHaveCount(0);
  });

  test('a published bulletin opens, links to its other edition, and offers PDF', async ({
    page,
    ward: state,
  }) => {
    await open(page, `/${ward.publicSlug}`);
    await page.getByRole('link', { name: BULLETIN.title }).click();
    await expect(page).toHaveURL(new RegExp(`/${ward.publicSlug}/${state.bulletins.published}$`));
    await expect(page.getByRole('heading', { name: 'Fictional Sacrament Meeting' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fictional Moving Help' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as PDF' })).toBeVisible();

    await page.getByRole('link', { name: 'Español' }).click();
    await expect(page).toHaveURL(new RegExp(`/${state.bulletins.spanish}$`));
    await expect(page.getByRole('button', { name: 'Guardar como PDF' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Fictional Sacrament Meeting (ES)' }),
    ).toBeVisible();

    await page.getByRole('link', { name: ward.name }).click();
    await expect(page).toHaveURL(new RegExp(`/${ward.publicSlug}$`));
  });

  test('Save as PDF opens the print dialog', async ({ page, ward: state }) => {
    await open(page, `/${ward.publicSlug}/${state.bulletins.published}`);
    await page.evaluate(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
      };
    });
    await page.getByRole('button', { name: 'Save as PDF' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  });

  test('a draft bulletin and an unknown bulletin show not found', async ({ page, ward: state }) => {
    await open(page, `/${ward.publicSlug}/${state.bulletins.draft}`);
    await heading(page, 'Bulletin not found');
    await page.getByRole('link', { name: 'See this unit’s page' }).click();
    await heading(page, ward.name);

    await open(page, `/${ward.publicSlug}/00000000-0000-0000-0000-000000000000`);
    await heading(page, 'Bulletin not found');
  });

  test('a bulletin id from one ward does not open under another ward’s path', async ({
    page,
    ward: state,
  }) => {
    await open(page, `/${unitByKey('otherWard').publicSlug}/${state.bulletins.published}`);
    await heading(page, 'Bulletin not found');
  });

  test('an unknown ward path shows not found with a sign-in link', async ({ page }) => {
    await open(page, '/fictionalnowhere');
    await heading(page, 'Ward page not found');
    await page.getByRole('link', { name: 'Continue to sign in' }).click();
    await expect(page).toHaveURL(/\/login\?ward=fictionalnowhere/);
  });

  test('the public header links home and to sign in for that ward', async ({ page }) => {
    await open(page, `/${ward.publicSlug}`);
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?ward=${ward.publicSlug}`));
    await heading(page, 'Sign in');
  });
});
