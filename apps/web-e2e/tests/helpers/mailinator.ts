import { expect, type Browser, type Page } from '@playwright/test';
import { e2eBaseUrl } from './env';

export interface MailinatorInbox {
  localPart: string;
  address: string;
}

export function fictionalMailinatorInbox(suffix: string): MailinatorInbox {
  const localPart = `wce2e${suffix.replace(/[^a-z0-9]/gi, '')}`.slice(0, 32).toLowerCase();
  return {
    localPart,
    address: `${localPart}@mailinator.com`,
  };
}

/**
 * Keep the token on E2E_BASE_URL even when the provider still emails a
 * per-deployment Vercel host.
 */
export function pathAndQueryFromEmailedUrl(emailedUrl: string): string {
  const parsed = new URL(emailedUrl);
  if (!/^\/(verify-email|reset-password)$/.test(parsed.pathname)) {
    throw new Error(`Unexpected emailed path: ${parsed.pathname}`);
  }
  if (!parsed.searchParams.get('token')) {
    throw new Error('Emailed link is missing a token.');
  }
  return `${parsed.pathname}${parsed.search}`;
}

export function appUrlFromEmailedLink(emailedUrl: string): string {
  return new URL(pathAndQueryFromEmailedUrl(emailedUrl), e2eBaseUrl()).toString();
}

async function dismissMailinatorNoise(page: Page): Promise<void> {
  const accept = page.getByRole('button', { name: /accept|agree|ok/i }).first();
  if (await accept.isVisible().catch(() => false)) {
    await accept.click().catch(() => undefined);
  }
}

/**
 * Public Mailinator inbox (no API key). Uses a fresh browser context so
 * admin session cookies are not sent to a third party.
 */
export async function waitForMailinatorLink(
  browser: Browser,
  input: { localPart: string; subject: RegExp; path: 'verify-email' | 'reset-password' },
): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const inboxUrl = `https://www.mailinator.com/v4/public/inboxes.jsp?to=${encodeURIComponent(input.localPart)}`;
    await page.goto(inboxUrl, { waitUntil: 'domcontentloaded' });
    await dismissMailinatorNoise(page);

    const inboxField = page.getByRole('textbox', { name: 'inbox field' });
    if (await inboxField.isVisible().catch(() => false)) {
      const current = await inboxField.inputValue();
      if (current !== input.localPart) {
        await inboxField.fill(input.localPart);
        await page.getByRole('button', { name: 'GO' }).click();
      }
    }

    const row = page.getByRole('row').filter({ hasText: input.subject }).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.click();

    const textTab = page.getByRole('tab', { name: /^TEXT$/i });
    if (await textTab.isVisible().catch(() => false)) {
      await textTab.click();
    }

    let href: string | null = null;
    await expect(async () => {
      for (const frame of page.frames()) {
        const candidate = await frame
          .locator(`a[href*="${input.path}"]`)
          .first()
          .getAttribute('href')
          .catch(() => null);
        if (candidate) {
          href = candidate;
          return;
        }
      }
      throw new Error('Mailinator message did not include a confirmation link yet.');
    }).toPass({ timeout: 20_000 });

    if (!href) {
      throw new Error('Mailinator message did not include a confirmation link.');
    }
    return href;
  } finally {
    await context.close();
  }
}
