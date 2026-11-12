import type { Locator, Page } from '@playwright/test';
import { UNITS, unitByKey } from '../../mock-ward/fixture';
import { expect, fill, heading, open, test, unique } from './helpers/fixtures';
import { RESET_SUBJECT, latestEmail } from './helpers/inbox';
import { as } from './helpers/sessions';

function card(page: Page, name: string): Locator {
  return page.locator('li.ward-card', {
    has: page.getByRole('heading', { name: new RegExp(`${name}$`) }),
  });
}

async function createUnitThroughForm(
  page: Page,
  input: {
    level: string;
    parent?: string;
    name: string;
    slug?: string;
    code: string;
    admin: string;
  },
): Promise<void> {
  await page.getByRole('button', { name: 'New unit' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create unit' })).toBeVisible();
  await page.getByLabel('Level').selectOption(input.level);
  if (input.parent) {
    await page.locator('#unit-parent').selectOption({ label: input.parent });
  }
  await fill(page, '#ward-name', input.name);
  await fill(page, '#ward-time-zone', 'America/Denver');
  if (input.slug) await fill(page, '#public-slug', input.slug);
  await fill(page, '#admin-username', input.admin);
  await fill(page, '#admin-display-name', `Fictional ${input.admin}`);
  await fill(page, '#admin-email', `${input.admin}@units.example.test`);
  await fill(page, '#admin-password', 'Fictional-Unit-Admin-42');
  await fill(page, '#initial-ward-code', input.code);
  await page.getByRole('button', { name: `Create ${input.level.toLowerCase()}` }).click();
}

test.describe('Units as the platform operator', () => {
  test.use(as('superadmin'));

  test('the whole hierarchy is listed with parents, public paths and admins', async ({ page }) => {
    await open(page, '/admin/wards');
    await expect(page.locator('.wards__header h2')).toHaveText('Units');
    for (const unit of UNITS) {
      const unitCard = card(page, unit.name);
      await expect(unitCard.locator('.ward-card__level')).toHaveText(unit.level);
      await expect(unitCard.getByRole('link', { name: `/${unit.publicSlug}` })).toBeVisible();
      await expect(unitCard).toContainText(`@${unit.admin.username}`);
      if (unit.parentKey) {
        await expect(unitCard).toContainText(`Under ${unitByKey(unit.parentKey).name}`);
      }
    }
    await expect(card(page, unitByKey('district').name)).toHaveClass(/ward-card--depth-0/);
    await expect(card(page, unitByKey('ward').name)).toHaveClass(/ward-card--depth-3/);

    await card(page, unitByKey('ward').name)
      .getByRole('link', { name: `/${unitByKey('ward').publicSlug}` })
      .click();
    await heading(page, unitByKey('ward').name);
  });

  test('the create form validates, Cancel closes it, and Districts have no parent', async ({
    page,
  }) => {
    await open(page, '/admin/wards');
    await page.getByRole('button', { name: 'New unit' }).click();
    await page.getByLabel('Level').selectOption('District');
    await expect(page.locator('#unit-parent')).toBeDisabled();
    await expect(page.getByText('Districts are the top level.')).toBeVisible();
    await page.getByLabel('Level').selectOption('Ward');
    await expect(page.locator('#unit-parent')).toBeEnabled();
    await expect(
      page.locator('#unit-parent option', { hasText: unitByKey('stake').name }),
    ).toHaveCount(1);
    await expect(
      page.locator('#unit-parent option', { hasText: unitByKey('region').name }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Create ward' }).click();
    await expect(page.locator('#ward-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#admin-password')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#initial-ward-code')).toHaveAttribute('aria-invalid', 'true');

    await page.getByRole('button', { name: 'Cancel' }).last().click();
    await expect(page.getByRole('heading', { name: 'Create unit' })).toHaveCount(0);
  });

  test('a code already used by another unit is refused', async ({ page }) => {
    await open(page, '/admin/wards');
    const suffix = unique();
    await createUnitThroughForm(page, {
      level: 'Ward',
      parent: unitByKey('stake').name,
      name: `Fictional Duplicate Code ${suffix}`,
      code: unitByKey('ward').code,
      admin: `dup.${suffix}`,
    });
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(card(page, `Fictional Duplicate Code ${suffix}`)).toHaveCount(0);
  });

  test('create a ward, then manage it: path, placement, admin password, reset email and code', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const suffix = unique();
    const name = `Fictional Juniper Ward ${suffix}`;
    const slug = `fictionaljuniper${suffix}`.slice(0, 60);
    const adminUsername = `juniper.${suffix}`;
    await open(page, '/admin/wards');
    await createUnitThroughForm(page, {
      level: 'Ward',
      parent: unitByKey('stake').name,
      name,
      slug,
      code: `JUN-${suffix}`,
      admin: adminUsername,
    });
    await expect(page.getByRole('heading', { name: 'New ward created' })).toBeVisible();
    await expect(page.getByText(`Ward "${name}" was created.`)).toBeVisible();
    const unitCard = card(page, name);
    await expect(unitCard).toContainText(`Under ${unitByKey('stake').name}`);

    await unitCard.getByRole('button', { name: 'Manage' }).click();
    await expect(unitCard.getByRole('button', { name: 'Close' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    const pathInput = unitCard.getByLabel(`Public page path for ${name}`);
    await pathInput.fill('Not A Valid Path!');
    await unitCard.getByRole('button', { name: 'Save path' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    const newSlug = `${slug.slice(0, 50)}x`;
    await pathInput.fill(newSlug);
    await unitCard.getByRole('button', { name: 'Save path' }).click();
    await expect(
      page.getByText(`Public campaigns for ${name} now appear at /${newSlug}.`),
    ).toBeVisible();

    const placement = unitCard.getByLabel(`Place ${name} under (Stake)`);
    await expect(unitCard.getByRole('button', { name: 'Move' })).toBeDisabled();
    await placement.selectOption({ label: 'Not placed' });
    await unitCard.getByRole('button', { name: 'Move' }).click();
    await expect(page.getByText(`${name} is no longer under another unit.`)).toBeVisible();
    await expect(card(page, name)).not.toContainText(`Under ${unitByKey('stake').name}`);
    await card(page, name)
      .getByLabel(`Place ${name} under (Stake)`)
      .selectOption({ label: unitByKey('stake').name });
    await card(page, name).getByRole('button', { name: 'Move' }).click();
    await expect(
      page.getByText(`${name} now sits under ${unitByKey('stake').name}.`),
    ).toBeVisible();

    const managed = card(page, name);
    const passwordField = managed.getByLabel(`Set password for ${adminUsername}`);
    await passwordField.fill('short');
    await managed.getByRole('button', { name: 'Set password' }).click();
    await expect(passwordField).toHaveAttribute('aria-invalid', 'true');
    await passwordField.fill('Fictional-Reset-Unit-42');
    await managed.getByRole('button', { name: 'Set password' }).click();
    await expect(page.getByText('Administrator password was set.')).toBeVisible();

    const since = new Date();
    await managed.getByRole('button', { name: 'Email reset link' }).click();
    await expect(
      page.getByText(`A password reset email was queued for ${adminUsername}@units.example.test.`),
    ).toBeVisible();
    await latestEmail(`${adminUsername}@units.example.test`, RESET_SUBJECT, since);

    const codeField = managed.getByLabel('New sign-in code');
    await codeField.fill('abc');
    await managed.getByRole('button', { name: 'Change sign-in code' }).click();
    await expect(codeField).toHaveAttribute('aria-invalid', 'true');
    await codeField.fill(`JUN-NEW-${suffix}`);
    await managed.getByRole('button', { name: 'Change sign-in code' }).click();
    await expect(page.getByText('Sign-in code changed.')).toBeVisible();

    await managed.getByRole('button', { name: 'Close' }).click();
    await expect(managed.getByRole('button', { name: 'Manage' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

test.describe('Units as a stake administrator', () => {
  test.use(as('stakeAdmin'));

  test('sees only the wards beneath the stake and can only create wards', async ({
    page,
    api,
    ward,
  }) => {
    await open(page, '/admin/units');
    await expect(page.locator('.wards__header h2')).toHaveText(
      `Units in ${unitByKey('stake').name}`,
    );
    await expect(card(page, unitByKey('ward').name)).toBeVisible();
    await expect(card(page, unitByKey('otherWard').name)).toBeVisible();
    await expect(card(page, unitByKey('region').name)).toHaveCount(0);
    await expect(card(page, unitByKey('district').name)).toHaveCount(0);

    await page.getByRole('button', { name: 'New unit' }).click();
    await expect(page.getByLabel('Level').locator('option')).toHaveText(['Ward']);
    await expect(page.locator('#unit-parent option', { hasText: 'Not placed yet' })).toHaveCount(0);

    const stakeApi = await api('stakeAdmin');
    const suffix = unique();
    const tooHigh = await stakeApi.post('/admin/units', {
      data: {
        name: `Fictional Rogue Stake ${suffix}`,
        level: 'Stake',
        adminUsername: `rogue.${suffix}`,
        adminEmail: `rogue.${suffix}@units.example.test`,
        adminDisplayName: 'Fictional Rogue',
        adminPassword: 'Fictional-Rogue-4242',
        initialWardCode: `ROGUE-${suffix}`,
      },
    });
    expect(tooHigh.status()).toBeGreaterThanOrEqual(400);
    expect(
      (
        await stakeApi.post(`/admin/units/${ward.units.district?.id}/code/rotate`, {
          data: { newWardCode: `X-${suffix}` },
        })
      ).status(),
    ).toBeGreaterThanOrEqual(400);
    expect((await stakeApi.get('/platform/wards')).status()).toBe(403);
  });

  test('creates a ward under the stake whose admin can then sign in', async ({
    page,
    anonymousApi,
  }) => {
    const suffix = unique();
    const name = `Fictional Birch Ward ${suffix}`;
    await open(page, '/admin/units');
    await createUnitThroughForm(page, {
      level: 'Ward',
      parent: unitByKey('stake').name,
      name,
      code: `BIRCH-${suffix}`,
      admin: `birch.${suffix}`,
    });
    await expect(page.getByText(`Ward "${name}" was created.`)).toBeVisible();
    await expect(card(page, name)).toContainText(`Under ${unitByKey('stake').name}`);
    const login = await anonymousApi.post('/auth/login', {
      data: {
        username: `birch.${suffix}`,
        password: 'Fictional-Unit-Admin-42',
        unitCode: `BIRCH-${suffix}`,
        clientType: 'mobile',
      },
    });
    expect(login.status()).toBe(200);
  });
});

test.describe('Units as a district administrator', () => {
  test.use(as('districtAdmin'));

  test('sees every unit beneath the district', async ({ page }) => {
    await open(page, '/admin/units');
    await expect(page.locator('.wards__header h2')).toHaveText(
      `Units in ${unitByKey('district').name}`,
    );
    for (const key of ['region', 'stake', 'ward', 'otherWard']) {
      await expect(card(page, unitByKey(key).name)).toBeVisible();
    }
    await page.getByRole('button', { name: 'New unit' }).click();
    await expect(page.getByLabel('Level').locator('option')).toHaveText([
      'Ward',
      'Stake',
      'Region',
    ]);
  });
});

test.describe('Units as a ward administrator', () => {
  test.use(as('wardAdmin'));

  test('a ward has nothing beneath it and cannot create units', async ({ api }) => {
    const wardApi = await api('wardAdmin');
    const suffix = unique();
    const response = await wardApi.post('/admin/units', {
      data: {
        name: `Fictional Sub Ward ${suffix}`,
        level: 'Ward',
        adminUsername: `sub.${suffix}`,
        adminEmail: `sub.${suffix}@units.example.test`,
        adminDisplayName: 'Fictional Sub',
        adminPassword: 'Fictional-Sub-424242',
        initialWardCode: `SUB-${suffix}`,
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect((await wardApi.get('/platform/wards')).status()).toBe(403);
  });
});
