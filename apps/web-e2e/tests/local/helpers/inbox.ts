import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import { mailDir } from '../../../mock-ward/env';

/**
 * The local inbox. The API sends account emails over SMTP to the mail
 * catcher (mock-ward/mail-catcher.ts), which saves each one as JSON. Tests
 * read the newest message for an address and follow its link, the same way
 * a member would click it in their mail app.
 */
export interface InboxMessage {
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
}

function messagesFor(toAddress: string, since: Date): InboxMessage[] {
  const files = (() => {
    try {
      return readdirSync(mailDir).filter((file) => file.endsWith('.json'));
    } catch {
      return [];
    }
  })();
  return files
    .map((file) => JSON.parse(readFileSync(path.join(mailDir, file), 'utf8')) as InboxMessage)
    .filter(
      (message) => message.to === toAddress.toLowerCase() && new Date(message.receivedAt) >= since,
    )
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function latestEmail(
  toAddress: string,
  subject: RegExp,
  since: Date,
): Promise<InboxMessage> {
  let found: InboxMessage | undefined;
  await expect
    .poll(
      () => {
        found = messagesFor(toAddress, since).find((message) => subject.test(message.subject));
        return Boolean(found);
      },
      { message: `waiting for an email to ${toAddress} matching ${subject}`, timeout: 20_000 },
    )
    .toBe(true);
  return found as InboxMessage;
}

export function inboxCount(toAddress: string, since: Date): number {
  return messagesFor(toAddress, since).length;
}

/** Path and query of the app link in an email, e.g. `/reset-password?token=…`. */
export function linkFromEmail(
  message: InboxMessage,
  pathname: '/verify-email' | '/reset-password',
): string {
  const match = message.body
    .match(/https?:\/\/[^\s"'<>]+/g)
    ?.find((url) => new URL(url).pathname === pathname);
  if (!match) {
    throw new Error(`No ${pathname} link in email "${message.subject}":\n${message.body}`);
  }
  const url = new URL(match);
  return `${url.pathname}${url.search}`;
}

export const RESET_SUBJECT = /reset your .* password/i;
export const CONFIRM_SUBJECT = /confirm your .* email/i;
