import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { localApiUrl, localWebUrl, repoRoot, stateDir } from '../../../mock-ward/env';
import { waitForHydration } from './fixtures';

export interface Control {
  /** Page pattern, with record ids replaced by `:id`. */
  page: string;
  kind: 'link' | 'button' | 'field';
  name: string;
}

export interface CrawlResult {
  visited: string[];
  controls: Control[];
  problems: string[];
}

const inventoryDir = path.join(stateDir, 'ui-inventory');
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{24}/gi;

/** `/campaigns/3f2…` → `/campaigns/:id`, so one page of each kind stands for the rest. */
export function pagePattern(urlPath: string): string {
  return urlPath.replace(ID, ':id').replace(/\/$/, '') || '/';
}

/** Console noise from the Nuxt dev server that says nothing about the app. */
const IGNORED_CONSOLE = [/\[vite\]/i, /hydration/i, /Download the Vue Devtools/i, /favicon/i];

interface PageFacts {
  links: Array<{ href: string; name: string }>;
  buttons: string[];
  fields: string[];
  unnamed: string[];
  headings: number;
  text: string;
}

async function readPage(page: Page): Promise<PageFacts> {
  return page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden';
    };
    const labelOf = (element: Element): string => {
      const labelled = element.getAttribute('aria-labelledby');
      const fromIds = labelled
        ? labelled
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
        : '';
      const forLabel =
        element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      return (
        element.getAttribute('aria-label') ??
        (fromIds ||
          (forLabel ? forLabel.textContent : null) ||
          element.closest('label')?.textContent ||
          element.textContent ||
          element.getAttribute('title') ||
          element.getAttribute('placeholder') ||
          '')
      )
        .replace(/\s+/g, ' ')
        .trim();
    };
    const describe = (element: Element): string =>
      `<${element.tagName.toLowerCase()}${element.id ? ` id="${element.id}"` : ''}${
        element.className && typeof element.className === 'string'
          ? ` class="${element.className}"`
          : ''
      }>`;

    const links: Array<{ href: string; name: string }> = [];
    const buttons: string[] = [];
    const fields: string[] = [];
    const unnamed: string[] = [];
    for (const anchor of Array.from(document.querySelectorAll('a[href]')).filter(visible)) {
      const name = labelOf(anchor);
      if (!name) unnamed.push(`link ${describe(anchor)}`);
      links.push({ href: (anchor as HTMLAnchorElement).href, name });
    }
    for (const button of Array.from(
      document.querySelectorAll('button, [role="button"], input[type="submit"]'),
    ).filter(visible)) {
      const name = labelOf(button) || (button as HTMLInputElement).value || '';
      if (!name) unnamed.push(`button ${describe(button)}`);
      else buttons.push(name);
    }
    for (const field of Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]), select, textarea',
      ),
    ).filter(visible)) {
      const name = labelOf(field);
      if (!name) unnamed.push(`field ${describe(field)}`);
      else fields.push(name);
    }
    return {
      links,
      buttons,
      fields,
      unnamed,
      headings: document.querySelectorAll('h1, h2').length,
      text: document.body.innerText,
    };
  });
}

/**
 * Follows every same-site link reachable from the start pages, visiting one
 * page of each kind, and reports anything on the way that is broken or that
 * a person could not make sense of.
 */
export async function crawl(
  page: Page,
  startPaths: string[],
  options: { maxPages?: number; signedOut?: boolean } = {},
): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? 120;
  const result: CrawlResult = { visited: [], controls: [], problems: [] };
  const queue = [...startPaths];
  const seen = new Set(startPaths.map(pagePattern));
  let current = '';
  const trouble: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    // A refused or missing request is reported below with its address.
    if (/Failed to load resource/.test(text)) return;
    trouble.push(`console error: ${text.slice(0, 200)}`);
  });
  page.on('pageerror', (error) => trouble.push(`script error: ${error.message.slice(0, 200)}`));
  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith(localApiUrl)) return;
    const status = response.status();
    const route = `${response.request().method()} ${pagePattern(new URL(url).pathname)}`;
    if (status >= 500) trouble.push(`the API crashed: ${route} → ${status}`);
    if (status === 403) trouble.push(`the page asked for something the role is refused: ${route}`);
    if (status === 404) trouble.push(`the page asked for something that is not there: ${route}`);
  });

  while (queue.length > 0 && result.visited.length < maxPages) {
    const target = queue.shift() as string;
    current = pagePattern(target.split('?')[0] ?? target);
    trouble.length = 0;
    const response = await page.goto(target);
    await waitForHydration(page);
    await page.waitForLoadState('networkidle');
    const landed = pagePattern(new URL(page.url()).pathname);
    result.visited.push(landed);
    const facts = await readPage(page);

    if (response && response.status() >= 400)
      trouble.push(`the page answered ${response.status()}`);
    // A signed-out visitor who follows a link into the app is sent to sign in.
    const sentToSignIn = options.signedOut === true && landed === '/login';
    if (landed !== current && !sentToSignIn) {
      trouble.push(`a link to ${current} lands on ${landed}`);
    }
    if (facts.headings === 0) trouble.push('the page has no heading');
    if ((await page.title()).trim().length === 0) trouble.push('the page has no title');
    for (const raw of [
      /Missing required permission/,
      /\b500\b.*error/i,
      /Page not found/i,
      /undefined|\[object Object\]|NaN/,
    ]) {
      const found = raw.exec(facts.text);
      if (found) trouble.push(`the page shows raw text "${found[0]}"`);
    }
    for (const control of facts.unnamed) trouble.push(`a control has no name: ${control}`);

    // Open every tab on the page so the controls inside each panel are counted too.
    const buttons = new Set(facts.buttons);
    const fields = new Set(facts.fields);
    const tabs = page.getByRole('tab');
    for (let index = 0; index < (await tabs.count()); index += 1) {
      await tabs.nth(index).click();
      const panel = await readPage(page);
      panel.buttons.forEach((name) => buttons.add(name));
      panel.fields.forEach((name) => fields.add(name));
      for (const control of panel.unnamed) trouble.push(`a control has no name: ${control}`);
    }
    for (const name of buttons) result.controls.push({ page: landed, kind: 'button', name });
    for (const name of fields) result.controls.push({ page: landed, kind: 'field', name });
    for (const link of facts.links) {
      if (!link.href.startsWith(localWebUrl)) continue;
      const url = new URL(link.href);
      result.controls.push({ page: landed, kind: 'link', name: link.name });
      if (url.pathname.startsWith('/api/') || /\.(pdf|png|svg|ico)$/.test(url.pathname)) continue;
      const pattern = pagePattern(url.pathname);
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      queue.push(url.pathname + url.search);
    }
    for (const entry of new Set(trouble)) result.problems.push(`${landed}: ${entry}`);
  }
  return result;
}

export function saveInventory(role: string, result: CrawlResult): void {
  mkdirSync(inventoryDir, { recursive: true });
  writeFileSync(path.join(inventoryDir, `${role}.json`), `${JSON.stringify(result, null, 2)}\n`);
}

export function loadInventories(): Record<string, CrawlResult> {
  const all: Record<string, CrawlResult> = {};
  for (const file of readdirSync(inventoryDir)) {
    all[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(path.join(inventoryDir, file), 'utf8'),
    ) as CrawlResult;
  }
  return all;
}

/** Every page the web app defines, as a pattern (`pages/campaigns/[id].vue` → `/campaigns/:id`). */
export function definedPages(): string[] {
  const pagesDir = path.join(repoRoot, 'apps', 'web', 'app', 'pages');
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.vue')) found.push(path.relative(pagesDir, full));
    }
  };
  walk(pagesDir);
  const patterns = found.map((file) => {
    const route = `/${file
      .replace(/\.vue$/, '')
      .replace(/\/index$/, '')
      .replace(/^index$/, '')}`;
    return route.replace(/\[[^\]]+\]/g, ':id').replace(/\/$/, '') || '/';
  });
  // A folder page (directory.vue) only wraps its children (directory/index.vue).
  return [...new Set(patterns)].sort();
}
