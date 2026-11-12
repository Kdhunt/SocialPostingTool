import { expect, test } from './helpers/fixtures';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { e2eRoot } from '../../mock-ward/env';
import { crawl, definedPages, loadInventories, saveInventory } from './helpers/crawl';
import { as, type SessionKey } from './helpers/sessions';

/**
 * Walks the whole site as each role and as a visitor: every link that role
 * is shown is followed, and one page of each kind is opened. On every page
 * the test checks that it loads, has a heading and a title, shows no raw
 * error text, asks the API for nothing the role is refused, logs no script
 * errors, and that every link, button and form field has a name a person
 * (or a screen reader) can read.
 *
 * The last test proves the walk was complete: every page the web app
 * defines was opened by at least one role.
 */
const PUBLIC_SLUG = 'fictionalmaplehollow';
const ROLES: SessionKey[] = [
  'superadmin',
  'districtAdmin',
  'stakeAdmin',
  'wardAdmin',
  'coordinator',
  'contributor',
  'viewer',
];

// One worker, in order, and a failure in one role does not skip the rest.
test.describe.configure({ mode: 'default' });
test.setTimeout(600_000);

for (const role of ROLES) {
  test.describe(`${role}`, () => {
    test.use(as(role));
    test(`${role}: every page the role can reach loads and makes sense`, async ({ page }) => {
      const result = await crawl(page, ['/']);
      saveInventory(role, result);
      expect(result.visited.length).toBeGreaterThan(3);
      expect(result.problems, result.problems.join('\n')).toEqual([]);
    });
  });
}

test('a visitor: sign-in, recovery and public pages load and make sense', async ({ page }) => {
  const result = await crawl(
    page,
    ['/login', '/forgot-password', '/reset-password', '/verify-email', `/${PUBLIC_SLUG}`],
    { signedOut: true },
  );
  saveInventory('visitor', result);
  expect(result.problems, result.problems.join('\n')).toEqual([]);
});

test('every page the web app defines was opened by at least one role', () => {
  const opened = new Set(
    Object.values(loadInventories()).flatMap((inventory) =>
      inventory.visited.map((visited) => visited.replace(`/${PUBLIC_SLUG}`, '/:id')),
    ),
  );
  // Layout wrappers: they render only their child pages.
  const wrappers = new Set(['/admin', '/audiences', '/directory']);
  const never = definedPages().filter((defined) => !opened.has(defined) && !wrappers.has(defined));
  expect(never, `Never opened:\n${never.join('\n')}`).toEqual([]);
});

test('every button the site shows is pressed by name in some test', () => {
  const specDir = path.join(e2eRoot, 'tests', 'local');
  const sources = [specDir, path.join(specDir, 'helpers')]
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => file.endsWith('.ts') && file !== 'every-page.spec.ts')
        .map((file) => readFileSync(path.join(dir, file), 'utf8')),
    )
    // Picker options are named after mock-ward records, so the fixture counts as a source.
    .concat(readFileSync(path.join(e2eRoot, 'mock-ward', 'fixture.ts'), 'utf8'))
    .join('\n');
  const shown = new Map<string, string>();
  for (const inventory of Object.values(loadInventories())) {
    for (const control of inventory.controls) {
      // Step tabs render as "1Setup": the number is decoration, the label is the name.
      if (control.kind === 'button') shown.set(control.name.replace(/^\d+/, ''), control.page);
    }
  }
  const untested = [...shown]
    .filter(([name]) => !sources.includes(name))
    .map(([name, page]) => `"${name}" on ${page}`);
  expect(untested, `No test presses:\n${untested.join('\n')}`).toEqual([]);
});
