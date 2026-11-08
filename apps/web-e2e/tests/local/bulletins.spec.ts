import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { BULLETIN, CUSTOM_ORGANIZATION, unitByKey } from '../../mock-ward/fixture';
import {
  acceptNextDialog,
  dismissNextDialog,
  expect,
  fill,
  heading,
  open,
  primaryNav,
  test,
  unique,
  reload,
} from './helpers/fixtures';
import { as } from './helpers/sessions';

const ward = unitByKey('ward');

async function newBulletin(
  api: APIRequestContext,
  title = `Fictional Bulletin ${unique()}`,
): Promise<{ id: string; title: string }> {
  const response = await api.post('/bulletins', { data: { title } });
  expect(response.status(), await response.text()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, title };
}

function section(page: Page, index: number): Locator {
  return page.locator('fieldset.editor__section').nth(index);
}

function preview(page: Page): Locator {
  return page.getByRole('region', { name: 'Preview' });
}

async function save(page: Page): Promise<void> {
  await page.locator('.page-header').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.locator('.editor__status')).not.toContainText('unsaved changes');
}

test.describe('Bulletin list', () => {
  test.use(as('wardAdmin'));

  test('shows published and draft bulletins with language and section counts', async ({ page }) => {
    await open(page, '/bulletins');
    await heading(page, 'Bulletins');
    const published = page.locator('.bulletin-list__item', { hasText: BULLETIN.title });
    await expect(published.locator('.bulletin-list__status')).toHaveText('Published');
    await expect(published).toContainText('English, 4 sections');
    await expect(
      page.locator('.bulletin-list__item', { hasText: BULLETIN.spanishTitle }),
    ).toContainText('Español');
    await expect(
      page
        .locator('.bulletin-list__item', { hasText: BULLETIN.draftTitle })
        .locator('.bulletin-list__status'),
    ).toHaveText('Draft');
    await page.getByRole('link', { name: new RegExp(BULLETIN.title) }).click();
    await expect(page.locator('.page-header h1')).toHaveText(BULLETIN.title);
  });

  test('New bulletin starts a draft and opens the editor', async ({ page }) => {
    await open(page, '/bulletins');
    await page.getByRole('button', { name: 'New bulletin' }).click();
    await expect(page).toHaveURL(/\/bulletins\/[0-9a-f-]+$/);
    await expect(page.locator('.editor__status')).toHaveText('Draft');
    await expect(page.locator('#bulletin-title')).not.toHaveValue('');
  });
});

test.describe('Bulletin editor', () => {
  test.use(as('wardAdmin'));

  test('header fields update the live preview and save', async ({ page, api }) => {
    const bulletin = await newBulletin(await api('wardAdmin'));
    await open(page, `/bulletins/${bulletin.id}`);
    const saveButton = page.locator('.page-header').getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeDisabled();

    const title = `Fictional Newsletter ${unique()}`;
    await fill(page, '#bulletin-title', title);
    await expect(page.locator('.editor__status')).toHaveText('Draft, unsaved changes');
    await expect(saveButton).toBeEnabled();
    await expect(page.locator('.page-header h1')).toHaveText(title);
    await expect(preview(page).getByRole('heading', { name: title })).toBeVisible();

    await fill(page, '#bulletin-kicker', 'Fictional Maple Hollow Ward');
    await expect(preview(page).getByText('Fictional Maple Hollow Ward')).toBeVisible();
    await page.locator('#bulletin-date').fill('2026-12-06');
    await page.getByLabel('Layout').selectOption('SingleColumn');
    await page.getByLabel('Language').selectOption('pt');
    await save(page);

    await reload(page);
    await expect(page.locator('#bulletin-title')).toHaveValue(title);
    await expect(page.locator('#bulletin-date')).toHaveValue('2026-12-06');
    await expect(page.getByLabel('Layout')).toHaveValue('SingleColumn');
    await expect(page.getByLabel('Language')).toHaveValue('pt');
  });

  test('sections: add main and side sections, choose organizations, reorder and remove', async ({
    page,
    api,
  }) => {
    const bulletin = await newBulletin(await api('wardAdmin'));
    await open(page, `/bulletins/${bulletin.id}`);
    await page.getByRole('button', { name: 'Add section', exact: true }).click();
    await page.getByRole('button', { name: 'Add side-column section' }).click();
    await page.getByRole('button', { name: 'Add section', exact: true }).click();
    await expect(page.locator('fieldset.editor__section')).toHaveCount(3);

    await section(page, 0).getByLabel('Heading', { exact: true }).fill('Fictional First');
    await section(page, 0).getByLabel('Organization').selectOption({ label: 'Relief Society' });
    await section(page, 1).getByLabel('Heading', { exact: true }).fill('Fictional Side');
    await expect(section(page, 1).getByLabel('Column')).toHaveValue('Side');
    await section(page, 1).getByLabel('Organization').selectOption({ label: CUSTOM_ORGANIZATION });
    await section(page, 2).getByLabel('Heading', { exact: true }).fill('Fictional Third');
    await section(page, 2).getByLabel('Subheading (optional)').fill('Saturday 9:00 AM');
    await section(page, 2).getByLabel('Organization').selectOption({ label: 'None' });

    await expect(section(page, 0).getByRole('button', { name: 'Move up' })).toBeDisabled();
    await expect(section(page, 2).getByRole('button', { name: 'Move down' })).toBeDisabled();
    await section(page, 2).getByRole('button', { name: 'Move up' }).click();
    await expect(section(page, 1).locator('legend')).toHaveText('Section 2: Fictional Third');
    await section(page, 0).getByRole('button', { name: 'Move down' }).click();
    await expect(section(page, 0).locator('legend')).toHaveText('Section 1: Fictional Third');

    await expect(preview(page).getByRole('heading', { name: 'Fictional Side' })).toBeVisible();
    await expect(preview(page).getByText('Saturday 9:00 AM')).toBeVisible();
    await save(page);

    await section(page, 2).getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('fieldset.editor__section')).toHaveCount(2);
    await save(page);
    await reload(page);
    await expect(page.locator('fieldset.editor__section')).toHaveCount(2);
    await expect(section(page, 0).getByLabel('Heading', { exact: true })).toHaveValue(
      'Fictional Third',
    );
    await expect(section(page, 1).getByLabel('Heading', { exact: true })).toHaveValue(
      'Fictional First',
    );
  });

  test('rich text toolbar: bold, italic, underline, heading, lists, link, table, undo and redo', async ({
    page,
    api,
  }) => {
    const bulletin = await newBulletin(await api('wardAdmin'));
    await open(page, `/bulletins/${bulletin.id}`);
    await page.getByRole('button', { name: 'Add section', exact: true }).click();
    const body = section(page, 0).locator('.ProseMirror');
    const toolbar = section(page, 0).getByRole('toolbar', { name: 'Formatting' });
    const newLine = async (): Promise<void> => {
      await body.focus();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.press('Enter');
    };
    const turnOn = async (name: string | RegExp): Promise<void> => {
      await toolbar.getByRole('button', { name }).click();
      await expect(toolbar.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    };

    await body.click();
    await page.keyboard.type('Fictional link text');
    await page.keyboard.press('ControlOrMeta+A');
    acceptNextDialog(page, 'https://example.test/fictional-signup');
    await toolbar.getByRole('button', { name: 'Link' }).click();
    await expect(body.locator('a[href="https://example.test/fictional-signup"]')).toHaveText(
      'Fictional link text',
    );

    for (const [name, tag] of [
      [/Bold/, 'strong'],
      [/Italic/, 'em'],
      [/Underline/, 'u'],
    ] as const) {
      await newLine();
      await turnOn(name);
      await page.keyboard.type(`Fictional ${tag} text`);
      await expect(body.locator(tag, { hasText: `Fictional ${tag} text` })).toBeVisible();
      await toolbar.getByRole('button', { name }).click();
    }

    await newLine();
    await turnOn('Heading');
    await page.keyboard.type('Fictional subheading');
    await expect(body.locator('h3', { hasText: 'Fictional subheading' })).toBeVisible();

    for (const [name, list] of [
      ['Bullets', 'ul'],
      ['Numbers', 'ol'],
    ] as const) {
      await newLine();
      await turnOn(name);
      await page.keyboard.type(`Fictional ${list} item`);
      await expect(body.locator(`${list} li`, { hasText: `Fictional ${list} item` })).toBeVisible();
      await toolbar.getByRole('button', { name }).click();
      await expect(body.locator(`${list} li`, { hasText: `Fictional ${list} item` })).toHaveCount(
        0,
      );
    }

    await newLine();
    await toolbar.getByRole('button', { name: 'Table' }).click();
    await expect(body.locator('table tr')).toHaveCount(3);
    await toolbar.getByRole('button', { name: '+ Row' }).click();
    await expect(body.locator('table tr')).toHaveCount(4);
    await toolbar.getByRole('button', { name: '+ Column' }).click();
    await expect(body.locator('table tr').first().locator('th, td')).toHaveCount(3);
    await toolbar.getByRole('button', { name: '− Column' }).click();
    await expect(body.locator('table tr').first().locator('th, td')).toHaveCount(2);
    await toolbar.getByRole('button', { name: '− Row' }).click();
    await expect(body.locator('table tr')).toHaveCount(3);
    await toolbar.getByRole('button', { name: 'Remove table' }).click();
    await expect(body.locator('table')).toHaveCount(0);

    await toolbar.getByRole('button', { name: 'Undo' }).click();
    await expect(body.locator('table')).toHaveCount(1);
    await toolbar.getByRole('button', { name: 'Redo' }).click();
    await expect(body.locator('table')).toHaveCount(0);

    await section(page, 0).getByLabel('Heading', { exact: true }).fill('Fictional Formatting');
    await save(page);
    await expect(
      preview(page).locator('strong', { hasText: 'Fictional strong text' }),
    ).toBeVisible();
    await expect(
      preview(page).locator('a[href="https://example.test/fictional-signup"]'),
    ).toBeVisible();
    await expect(preview(page).locator('h3', { hasText: 'Fictional subheading' })).toBeVisible();
  });

  test('a link that is not http, mailto or tel is refused', async ({ page, api }) => {
    const bulletin = await newBulletin(await api('wardAdmin'));
    await open(page, `/bulletins/${bulletin.id}`);
    await page.getByRole('button', { name: 'Add section', exact: true }).click();
    const body = section(page, 0).locator('.ProseMirror');
    await body.click();
    await page.keyboard.type('Fictional unsafe link');
    await page.keyboard.press('Shift+Home');
    const messages: string[] = [];
    page.on('dialog', (dialog) => {
      messages.push(dialog.message());
      void (dialog.type() === 'prompt' ? dialog.accept('javascript:alert(1)') : dialog.accept());
    });
    await section(page, 0).getByRole('button', { name: 'Link' }).click();
    await expect.poll(() => messages.length).toBe(2);
    expect(messages[1]).toContain('Links must start with');
    await expect(body.locator('a')).toHaveCount(0);
  });

  test('image and link fields: alt text is required and the link prints a QR code', async ({
    page,
    api,
  }) => {
    const bulletin = await newBulletin(await api('wardAdmin'));
    await open(page, `/bulletins/${bulletin.id}`);
    await page.getByRole('button', { name: 'Add section', exact: true }).click();
    await section(page, 0).getByLabel('Heading', { exact: true }).fill('Fictional Picture');
    await section(page, 0)
      .getByLabel('Image link (optional)')
      .fill('https://example.test/fictional.jpg');
    await page.locator('.page-header').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('Section 1:');

    await section(page, 0).getByLabel('Describe the image').fill('A fictional chapel');
    await section(page, 0)
      .getByLabel('More information link (optional)')
      .fill('https://example.test/fictional-more');
    await section(page, 0).getByLabel('Link text').fill('Fictional sign-up');
    await save(page);
    await expect(preview(page).locator('img[alt="A fictional chapel"]')).toBeAttached();
    await expect(preview(page).locator('.bulletin-doc__qr svg')).toBeAttached();
  });

  test('leaving with unsaved changes asks first; staying keeps the edits', async ({
    page,
    api,
  }) => {
    const bulletin = await newBulletin(await api('wardAdmin'));
    await open(page, `/bulletins/${bulletin.id}`);
    await fill(page, '#bulletin-title', `Unsaved ${unique()}`);
    dismissNextDialog(page);
    await primaryNav(page).getByRole('link', { name: 'Campaigns' }).click();
    await expect(page).toHaveURL(new RegExp(`/bulletins/${bulletin.id}$`));
    await expect(page.locator('.editor__status')).toContainText('unsaved changes');

    acceptNextDialog(page);
    await primaryNav(page).getByRole('link', { name: 'Campaigns' }).click();
    await heading(page, 'Campaigns');
  });

  test('publish, share, unpublish: the public page follows', async ({ page, api, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const bulletin = await newBulletin(await api('wardAdmin'));
    await open(page, `/bulletins/${bulletin.id}`);
    await page.getByRole('button', { name: 'Add section', exact: true }).click();
    await section(page, 0).getByLabel('Heading', { exact: true }).fill('Fictional Public Section');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published. Anyone with the link can read it.')).toBeVisible();
    await expect(page.locator('.editor__status')).toHaveText('Published');

    const share = page.getByRole('region', { name: 'Share' });
    const publicLink = share.getByRole('link');
    await expect(publicLink).toHaveAttribute(
      'href',
      new RegExp(`/${ward.publicSlug}/${bulletin.id}$`),
    );
    await share.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.getByText('Link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      `/${ward.publicSlug}/${bulletin.id}`,
    );
    await expect(preview(page).locator('svg').last()).toBeAttached();

    const visitor = await context.browser()!.newContext();
    const reader = await visitor.newPage();
    try {
      await open(reader, `/${ward.publicSlug}/${bulletin.id}`);
      await expect(reader.getByRole('heading', { name: 'Fictional Public Section' })).toBeVisible();

      await page.getByRole('button', { name: 'Unpublish' }).click();
      await expect(
        page.getByText('Unpublished. The public page no longer shows it.'),
      ).toBeVisible();
      // Public bulletins are cached (max-age=60, stale-while-revalidate=300), so check from a fresh browser.
      const freshVisitor = await context.browser()!.newContext();
      try {
        const freshReader = await freshVisitor.newPage();
        await open(freshReader, `/${ward.publicSlug}/${bulletin.id}`);
        await heading(freshReader, 'Bulletin not found');
      } finally {
        await freshVisitor.close();
      }
    } finally {
      await visitor.close();
    }
  });

  test('Print or save as PDF opens the print dialog', async ({ page, ward: state }) => {
    await open(page, `/bulletins/${state.bulletins.draft}`);
    await page.evaluate(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
      };
    });
    await page.getByRole('button', { name: 'Print or save as PDF' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  });

  test('copy to translate starts a linked edition in another language', async ({ page, api }) => {
    const bulletin = await newBulletin(await api('wardAdmin'));
    await open(page, `/bulletins/${bulletin.id}`);
    await page.getByLabel('Start another edition in').selectOption('fr');
    await page.getByRole('button', { name: 'Copy to translate' }).click();
    await expect(page).toHaveURL(/\/bulletins\/[0-9a-f-]+\?started=fr$/);
    await expect(page.getByText('Started the Français edition as a copy.')).toBeVisible();
    await expect(page.getByLabel('Language')).toHaveValue('fr');
    await expect(page.getByText('Français (this one)')).toBeVisible();
    await page.getByRole('link', { name: 'English (draft)' }).click();
    await expect(page).toHaveURL(new RegExp(`/bulletins/${bulletin.id}$`));
    await expect(
      page.getByLabel('Start another edition in').locator('option[value="fr"]'),
    ).toHaveCount(0);
  });

  test('delete asks for confirmation; cancelling keeps the bulletin', async ({ page, api }) => {
    const bulletin = await newBulletin(await api('wardAdmin'));
    await open(page, `/bulletins/${bulletin.id}`);
    dismissNextDialog(page);
    await page.getByRole('button', { name: 'Delete bulletin' }).click();
    await expect(page).toHaveURL(new RegExp(`/bulletins/${bulletin.id}$`));

    acceptNextDialog(page);
    await page.getByRole('button', { name: 'Delete bulletin' }).click();
    await expect(page).toHaveURL(/\/bulletins$/);
    await expect(page.getByText(bulletin.title)).toHaveCount(0);
    await open(page, `/bulletins/${bulletin.id}`);
    await expect(page.getByText('This bulletin no longer exists.')).toBeVisible();
  });
});

test.describe('Bulletins as contributor', () => {
  test.use(as('contributor'));

  test('a contributor can draft but not publish, and cannot change a live bulletin', async ({
    page,
    api,
    ward: state,
  }) => {
    const bulletin = await newBulletin(await api('contributor'));
    await open(page, `/bulletins/${bulletin.id}`);
    await fill(page, '#bulletin-title', `Contributor ${unique()}`);
    await save(page);
    await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
    expect(
      (await (await api('contributor')).post(`/bulletins/${bulletin.id}/publish`)).status(),
    ).toBe(403);

    await open(page, `/bulletins/${state.bulletins.published}`);
    await expect(
      page.getByText('This bulletin is live. Only someone who can publish can change it.'),
    ).toBeVisible();
    await expect(page.locator('#bulletin-title')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete bulletin' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Unpublish' })).toHaveCount(0);
  });
});
