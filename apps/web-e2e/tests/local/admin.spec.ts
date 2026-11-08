import type { APIResponse, Locator, Page } from '@playwright/test';
import {
  CUSTOM_ORGANIZATION,
  FACEBOOK_PAGE,
  UNITS,
  WARD_USERS,
  unitByKey,
} from '../../mock-ward/fixture';
import {
  acceptNextDialog,
  createThrowawayUser,
  dismissNextDialog,
  expect,
  fill,
  heading,
  open,
  signInThroughForm,
  test,
  unique,
} from './helpers/fixtures';
import { CONFIRM_SUBJECT, RESET_SUBJECT, latestEmail } from './helpers/inbox';
import { as } from './helpers/sessions';

async function orgRow(page: Page, name: string): Promise<Locator> {
  await expect(page.locator('.orgs__list input').first()).toBeVisible();
  const values = await page
    .locator('.orgs__list input')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  const index = values.indexOf(name);
  if (index === -1)
    throw new Error(`Organization "${name}" is not listed (found: ${values.join(', ')}).`);
  return page.locator('.orgs__item').nth(index);
}

function userRow(page: Page, username: string): Locator {
  return page.locator('li', { hasText: `@${username}` });
}

test.describe('User management', () => {
  test.use(as('wardAdmin'));

  test('lists every ward account with roles, email status and disabled state', async ({ page }) => {
    await open(page, '/admin/users');
    await heading(page, 'User management');
    await expect(userRow(page, unitByKey('ward').admin.username)).toContainText('WardAdmin');
    for (const user of WARD_USERS) {
      const row = userRow(page, user.username);
      await expect(row).toContainText(user.displayName);
      await expect(row).toContainText(user.roles.join(', '));
      await expect(row.getByText('Email unconfirmed')).toBeVisible();
    }
    await expect(
      userRow(page, 'ward.disabled').getByText('Disabled', { exact: true }),
    ).toBeVisible();
    await expect(
      userRow(page, 'ward.disabled').getByRole('button', { name: 'Enable' }),
    ).toBeVisible();
    // Accounts from other units never appear.
    await expect(page.getByText(`@${unitByKey('otherWard').admin.username}`)).toHaveCount(0);
  });

  test('create user: each field is validated before anything is saved', async ({ page }) => {
    await open(page, '/admin/users');
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(page.getByText('Username is required.')).toBeVisible();
    await expect(page.getByText('Display name is required.')).toBeVisible();
    await expect(page.getByText('Password must be at least 12 characters.')).toBeVisible();
    await expect(page.getByText('Select at least one role.')).toBeVisible();

    await fill(page, '#new-username', `fic.${unique()}`);
    await fill(page, '#new-email', 'not-an-email');
    await fill(page, '#new-display-name', 'Fictional Person');
    await fill(page, '#new-password', 'short');
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(page.locator('#new-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#new-password')).toHaveAttribute('aria-invalid', 'true');
  });

  test('create user: a duplicate username is refused', async ({ page }) => {
    await open(page, '/admin/users');
    await fill(page, '#new-username', 'ward.viewer');
    await fill(page, '#new-email', `dup.${unique()}@maplehollow.example.test`);
    await fill(page, '#new-display-name', 'Fictional Duplicate');
    await fill(page, '#new-password', 'Fictional-Duplicate-42');
    await page.getByRole('checkbox', { name: 'Viewer' }).check();
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.locator('li', { hasText: 'Fictional Duplicate' })).toHaveCount(0);
  });

  test('create user: the account appears and a confirmation email arrives (without the password)', async ({
    page,
  }) => {
    const suffix = unique();
    const email = `fic.new.${suffix}@maplehollow.example.test`;
    const since = new Date();
    await open(page, '/admin/users');
    await fill(page, '#new-username', `fic.new.${suffix}`);
    await fill(page, '#new-email', email);
    await fill(page, '#new-display-name', `Fictional New ${suffix}`);
    await fill(page, '#new-password', 'Fictional-NewUser-42');
    await page.getByRole('checkbox', { name: 'Contributor' }).check();
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(page.getByRole('status')).toContainText(
      'User created. A confirmation email was queued',
    );
    await expect(userRow(page, `fic.new.${suffix}`)).toContainText('Contributor');
    const message = await latestEmail(email, CONFIRM_SUBJECT, since);
    expect(message.body).not.toContain('Fictional-NewUser-42');
  });

  test('edit roles, change email, resend confirmation and email a reset link', async ({
    page,
    api,
    ward,
  }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    await open(page, '/admin/users');
    const row = userRow(page, user.username);

    await row.getByRole('button', { name: 'Edit roles' }).click();
    await row.getByRole('checkbox', { name: 'Viewer' }).uncheck();
    await row.getByRole('checkbox', { name: 'CommunicationsCoordinator' }).check();
    await row.getByRole('button', { name: 'Save roles' }).click();
    await expect(row).toContainText('CommunicationsCoordinator');
    await expect(row.getByRole('button', { name: 'Save roles' })).toHaveCount(0);

    await row.getByRole('button', { name: 'Change email' }).click();
    await fill(page, `#edit-email-${user.id}`, 'nope');
    await row.getByRole('button', { name: 'Save email' }).click();
    await expect(page.locator(`#edit-email-${user.id}`)).toHaveAttribute('aria-invalid', 'true');
    const newEmail = `moved.${unique()}@maplehollow.example.test`;
    const since = new Date();
    await fill(page, `#edit-email-${user.id}`, newEmail);
    await row.getByRole('button', { name: 'Save email' }).click();
    await expect(page.getByRole('status')).toContainText('Email updated.');
    await expect(row).toContainText(newEmail);
    await latestEmail(newEmail, CONFIRM_SUBJECT, since);

    const resendSince = new Date();
    await row.getByRole('button', { name: 'Resend confirmation' }).click();
    await expect(page.getByRole('status')).toContainText(
      `A confirmation email was queued for ${newEmail}`,
    );
    await latestEmail(newEmail, CONFIRM_SUBJECT, resendSince);

    await row.getByRole('button', { name: 'Email reset link' }).click();
    await expect(page.getByRole('status')).toContainText(
      `A password reset email was queued for ${newEmail}`,
    );
    await latestEmail(newEmail, RESET_SUBJECT, since);
  });

  test('set a password: too short is refused, a valid one lets the user sign in', async ({
    page,
    browser,
    api,
    ward,
  }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    await open(page, '/admin/users');
    const row = userRow(page, user.username);
    await row.getByRole('button', { name: 'Set password' }).click();
    await fill(page, `#reset-password-${user.id}`, 'short');
    await row.getByRole('button', { name: 'Save new password' }).click();
    await expect(row.getByText(/at least 12 characters/)).toBeVisible();
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator(`#reset-password-${user.id}`)).toHaveCount(0);

    await row.getByRole('button', { name: 'Set password' }).click();
    await fill(page, `#reset-password-${user.id}`, 'Fictional-Override-42');
    await row.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.locator(`#reset-password-${user.id}`)).toHaveCount(0);

    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await signInThroughForm(guestPage, {
        username: user.username,
        password: 'Fictional-Override-42',
        unitCode: user.unitCode,
      });
      await heading(guestPage, `Welcome, ${user.displayName}`);
    } finally {
      await guest.close();
    }
  });

  test('disable and re-enable an account; a disabled account’s API session stops working', async ({
    page,
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
    expect(
      (
        await anonymousApi.get('/auth/session', { headers: { Authorization: `Bearer ${token}` } })
      ).status(),
    ).toBe(200);

    await open(page, '/admin/users');
    const row = userRow(page, user.username);
    await row.getByRole('button', { name: 'Disable' }).click();
    await expect(row.getByText('Disabled', { exact: true })).toBeVisible();
    expect(
      (
        await anonymousApi.get('/auth/session', { headers: { Authorization: `Bearer ${token}` } })
      ).status(),
    ).toBe(401);

    await row.getByRole('button', { name: 'Enable' }).click();
    await expect(row.getByText('Disabled', { exact: true })).toHaveCount(0);
  });

  test('inline forms close with Cancel', async ({ page, api, ward }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    await open(page, '/admin/users');
    const row = userRow(page, user.username);
    await row.getByRole('button', { name: 'Change email' }).click();
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator(`#edit-email-${user.id}`)).toHaveCount(0);
    await row.getByRole('button', { name: 'Edit roles' }).click();
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(row.getByRole('button', { name: 'Save roles' })).toHaveCount(0);
  });
});

test.describe('Unit sign-in code', () => {
  test.use(as('superadmin'));

  test('rotating the code: a short code is refused; afterwards only the new code signs in', async ({
    browser,
    api,
    anonymousApi,
  }) => {
    test.setTimeout(120_000);
    const suffix = unique();
    const admin = {
      username: `rot.admin.${suffix}`,
      password: 'Fictional-Rotate-42',
      code: `ROT-OLD-${suffix}`,
    };
    const created = await (
      await api('superadmin')
    ).post('/platform/wards', {
      data: {
        name: `Fictional Rotation Ward ${suffix}`,
        level: 'Ward',
        parentId: undefined,
        timeZone: 'America/Denver',
        adminUsername: admin.username,
        adminEmail: `${admin.username}@rotation.example.test`,
        adminDisplayName: 'Fictional Rotation Clerk',
        adminPassword: admin.password,
        initialWardCode: admin.code,
      },
    });
    expect(created.status(), await created.text()).toBe(201);

    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signInThroughForm(page, {
        username: admin.username,
        password: admin.password,
        unitCode: admin.code,
      });
      await heading(page, 'Welcome, Fictional Rotation Clerk');
      await open(page, '/admin/ward-code');
      await heading(page, 'Ward code');
      await expect(page.getByRole('heading', { name: 'Active version' })).toBeVisible();
      await expect(page.getByText('Version 1')).toBeVisible();

      await fill(page, '#new-ward-code', 'abc');
      await page.getByRole('button', { name: 'Rotate ward code' }).click();
      await expect(page.getByRole('alert')).toBeVisible();

      const newCode = `ROT-NEW-${suffix}`;
      await fill(page, '#new-ward-code', newCode);
      await page.getByRole('button', { name: 'Rotate ward code' }).click();
      await expect(page.getByText('Ward code rotated.')).toBeVisible();
      await expect(page.getByText('Version 2')).toBeVisible();
      await expect(page.getByText(newCode)).toHaveCount(0);

      const attempt = (unitCode: string): Promise<APIResponse> =>
        anonymousApi.post('/auth/login', {
          data: {
            username: admin.username,
            password: admin.password,
            unitCode,
            clientType: 'mobile',
          },
        });
      expect((await attempt(admin.code)).status()).toBe(401);
      expect((await attempt(newCode)).status()).toBe(200);
    } finally {
      await context.close();
    }
  });
});

test.describe('Organizations', () => {
  test.use(as('wardAdmin'));

  test('lists the default organizations and the custom one', async ({ page }) => {
    await open(page, '/admin/organizations');
    await heading(page, 'Organizations', 2);
    await expect(page.locator('.orgs__list input').first()).toBeVisible();
    const values = await page
      .locator('.orgs__list input')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    expect(values).toEqual(
      expect.arrayContaining([
        'General',
        'Relief Society',
        'Priesthood',
        'Young Women',
        'Youth',
        'Primary',
        CUSTOM_ORGANIZATION,
      ]),
    );
  });

  test('add, rename and remove an organization', async ({ page }) => {
    const name = `Fictional Activities ${unique()}`;
    await open(page, '/admin/organizations');
    const add = page.locator('form.orgs__add');
    await expect(add.getByRole('button', { name: 'Add' })).toBeDisabled();
    await fill(page, '#org-new', name);
    await add.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(`Added ${name}.`)).toBeVisible();

    const row = await orgRow(page, name);
    await expect(row.getByRole('button', { name: 'Rename' })).toBeDisabled();
    const input = row.locator('input');
    await input.fill(`${name} Renamed`);
    await row.getByRole('button', { name: 'Rename' }).click();
    await expect(page.getByText(`Renamed to ${name} Renamed.`)).toBeVisible();

    await expect
      .poll(
        async () =>
          await orgRow(page, `${name} Renamed`)
            .then(() => true)
            .catch(() => false),
      )
      .toBe(true);
    const renamed = await orgRow(page, `${name} Renamed`);
    dismissNextDialog(page);
    await renamed.getByRole('button', { name: 'Remove' }).click();
    await expect
      .poll(
        async () =>
          await orgRow(page, `${name} Renamed`)
            .then(() => true)
            .catch(() => false),
      )
      .toBe(true);
    acceptNextDialog(page);
    await renamed.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText(`Removed ${name} Renamed.`)).toBeVisible();
    await expect
      .poll(
        async () =>
          await orgRow(page, `${name} Renamed`)
            .then(() => true)
            .catch(() => false),
      )
      .toBe(false);
  });
});

test.describe('Provider credentials', () => {
  test.use(as('wardAdmin'));

  test('lists stored credentials without ever showing a secret', async ({ page }) => {
    await open(page, '/admin/provider-credentials');
    await heading(page, 'Provider credentials');
    await expect(page.locator('li', { hasText: 'fictional-email-account' })).toContainText('Email');
    await expect(
      page.locator('li', { hasText: 'fictional-sms-account' }).getByText('Revoked'),
    ).toBeVisible();
    await expect(page.locator('li', { hasText: FACEBOOK_PAGE.pageId })).toContainText(
      'FacebookPage',
    );
    await expect(
      page.getByText(/fictional-page-access-token|ACfictional|"pass":"fictional"/),
    ).toHaveCount(0);
    await page.getByText('Example JSON shapes').click();
    await expect(page.getByText('Email (Resend):')).toBeVisible();
    await page.getByRole('link', { name: 'Facebook Page' }).last().click();
    await heading(page, 'Facebook Page');
  });

  test('invalid JSON is refused; valid credentials save and can be revoked', async ({ page }) => {
    const reference = `fictional-ref-${unique()}`;
    await open(page, '/admin/provider-credentials');
    await fill(page, '#cred-ref', reference);
    await page.locator('#cred-json').fill('not-json');
    await page.getByRole('button', { name: 'Save credentials' }).click();
    await expect(page.getByText('Credentials must be valid JSON.')).toBeVisible();

    await page.getByLabel('Channel').selectOption('Sms');
    await page.locator('#cred-json').fill(
      JSON.stringify({
        accountSid: 'ACfictional2',
        authToken: 'fictional-secret-xyz',
        fromNumber: '+18015550133',
      }),
    );
    await page.locator('#cred-expires').fill('2030-01-01T12:00');
    await page.getByRole('button', { name: 'Save credentials' }).click();
    const row = page.locator('li', { hasText: reference });
    await expect(row).toContainText('Sms');
    await expect(row).toContainText('Expires');
    await expect(page.getByText('fictional-secret-xyz')).toHaveCount(0);
    await row.getByRole('button', { name: 'Revoke' }).click();
    await expect(row.getByText('Revoked')).toBeVisible();
  });
});

test.describe('Facebook Page', () => {
  test.use(as('wardAdmin'));

  test('shows the connected page, connects another by token and disconnects it', async ({
    page,
  }) => {
    await open(page, '/admin/facebook-page');
    await heading(page, 'Facebook Page');
    const connected = page.getByRole('region', { name: 'Connected pages for this ward' });
    await expect(connected.getByText(FACEBOOK_PAGE.pageName)).toBeVisible();
    await expect(page.getByText(FACEBOOK_PAGE.pageAccessToken)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Connect with Facebook' })).toHaveCount(0);

    const pageId = `1${Date.now().toString().slice(-14)}`;
    const name = `Fictional Youth Page ${unique()}`;
    await fill(page, '#fb-page-name', name);
    await fill(page, '#fb-page-id', pageId);
    await fill(page, '#fb-page-token', 'fictional-token-for-test');
    await page.getByRole('button', { name: 'Save page for this ward' }).click();
    await expect(page.getByText('Facebook Page connected for this ward.')).toBeVisible();
    const row = connected.locator('li', { hasText: name });
    await expect(row).toContainText(`Page id ${pageId}`);

    await open(page, '/audiences/destinations');
    await expect(page.getByText(`${name} (FacebookPage)`)).toBeVisible();

    await open(page, '/admin/facebook-page');
    await connected
      .locator('li', { hasText: name })
      .getByRole('button', { name: 'Disconnect' })
      .click();
    await expect(page.getByText('Facebook Page disconnected for this ward.')).toBeVisible();
    await expect(connected.locator('li', { hasText: name })).toHaveCount(0);
  });

  test('a missing page id or token is refused', async ({ page }) => {
    await open(page, '/admin/facebook-page');
    await page.getByRole('button', { name: 'Save page for this ward' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Facebook Page connected for this ward.')).toHaveCount(0);
  });

  test('a Page id that is not a number is refused', async ({ api }) => {
    test.fail(
      true,
      'Validation gap: any text is accepted as a Facebook Page id (Page ids are numeric), creating an unusable destination.',
    );
    const response = await (
      await api('wardAdmin')
    ).post('/facebook-page/connect', {
      data: { pageId: `not-a-page-id-${unique()}`, pageAccessToken: 'fictional-token' },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('Audit log', () => {
  test.use(as('wardAdmin'));

  test('shows the history of the mock ward and filters by action and entity', async ({ page }) => {
    await open(page, '/admin/audit');
    await heading(page, 'Audit log');
    const table = page.getByRole('table');
    await expect(table.getByRole('row').nth(1)).toBeVisible();

    await fill(page, '#audit-action', 'campaign.created');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(table.getByRole('cell', { name: 'campaign.created' }).first()).toBeVisible();
    await expect
      .poll(async () => [
        ...new Set(await table.locator('tbody tr td:nth-child(2)').allTextContents()),
      ])
      .toEqual(['campaign.created']);

    await fill(page, '#audit-action', '');
    await fill(page, '#audit-entity', 'Person');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect
      .poll(async () => [
        ...new Set(
          (await table.locator('tbody tr td:nth-child(3)').allTextContents()).map(
            (cell) => cell.split(' ')[0],
          ),
        ),
      ])
      .toEqual(['Person']);
    await expect(table.getByRole('cell', { name: 'Fictional Ward Clerk' }).first()).toBeVisible();

    await fill(page, '#audit-entity', 'NoSuchFictionalEntity');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByText('No audit events found.')).toBeVisible();
  });

  test('“Action contains” finds partial action names', async ({ page }) => {
    test.fail(
      true,
      'BUG: the filter is labelled "Action contains" but the API matches the action name exactly (where.action = query.action).',
    );
    await open(page, '/admin/audit');
    await expect(page.getByRole('table')).toBeVisible();
    await fill(page, '#audit-action', 'campaign');
    const response = page.waitForResponse(
      (r) => r.url().includes('/audit?') && r.url().includes('action=campaign'),
    );
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await response;
    await expect(page.getByText('No audit events found.')).toHaveCount(0);
    const actions = await page
      .getByRole('table')
      .locator('tbody tr td:nth-child(2)')
      .allTextContents();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((action) => action.startsWith('campaign.'))).toBe(true);
  });

  test('audit entries never contain passwords or codes', async ({ api }) => {
    const events = (
      await (await (await api('wardAdmin')).get('/audit?limit=200')).text()
    ).toLowerCase();
    for (const secret of [
      ...UNITS.map((unit) => unit.code),
      ...UNITS.map((unit) => unit.admin.password),
      ...WARD_USERS.map((user) => user.password),
    ]) {
      expect(events).not.toContain(secret.toLowerCase());
    }
  });
});

test.describe('Administration for a coordinator', () => {
  test.use(as('coordinator'));

  test('a coordinator can use providers, Facebook and audit but not users or the code', async ({
    page,
    api,
  }) => {
    for (const [path, title] of [
      ['/admin/provider-credentials', 'Provider credentials'],
      ['/admin/facebook-page', 'Facebook Page'],
      ['/admin/audit', 'Audit log'],
    ] as const) {
      await open(page, path);
      await heading(page, title);
      await expect(page.getByText('Missing required permission')).toHaveCount(0);
    }
    const coordinator = await api('coordinator');
    expect((await coordinator.get('/users')).status()).toBe(403);
    expect((await coordinator.get('/ward/code')).status()).toBe(403);
    expect((await coordinator.post('/organizations', { data: { name: 'Blocked' } })).status()).toBe(
      403,
    );

    // Without users.manage the page sends the coordinator home instead of showing an error.
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/$/);
    await heading(page, /^Welcome/);
  });
});
