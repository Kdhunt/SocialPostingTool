/**
 * Standard footer appended to outbound Email/SMS bodies. Ward-local
 * ContactConsent is separate from Church Account subscriptions — we never
 * infer Church Account subscription status into ContactConsent.
 */
export const CHURCH_ACCOUNT_SUBSCRIPTIONS_URL = 'https://account.churchofjesuschrist.org/subscriptions';

export const EMAIL_COMMUNICATION_FOOTER = `\n\n---\nYou are receiving this message from your ward leadership. To manage your Church Account communication preferences (separate from ward-local consent), visit ${CHURCH_ACCOUNT_SUBSCRIPTIONS_URL}`;

export const SMS_COMMUNICATION_FOOTER = `\n\nManage Church Account prefs: ${CHURCH_ACCOUNT_SUBSCRIPTIONS_URL}`;

export function appendEmailFooter(body: string): string {
  if (body.includes(CHURCH_ACCOUNT_SUBSCRIPTIONS_URL)) return body;
  return `${body}${EMAIL_COMMUNICATION_FOOTER}`;
}

export function appendSmsFooter(body: string): string {
  if (body.includes(CHURCH_ACCOUNT_SUBSCRIPTIONS_URL)) return body;
  return `${body}${SMS_COMMUNICATION_FOOTER}`;
}
