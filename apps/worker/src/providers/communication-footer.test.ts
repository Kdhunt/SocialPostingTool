import { describe, expect, it } from 'vitest';
import {
  appendEmailFooter,
  appendSmsFooter,
  CHURCH_ACCOUNT_SUBSCRIPTIONS_URL,
} from './communication-footer.js';

describe('communication footer', () => {
  it('appends Church Account subscriptions URL to email bodies', () => {
    const result = appendEmailFooter('Hello ward members.');
    expect(result).toContain(CHURCH_ACCOUNT_SUBSCRIPTIONS_URL);
    expect(result).toContain('Hello ward members.');
  });

  it('appends Church Account subscriptions URL to SMS bodies', () => {
    const result = appendSmsFooter('Reminder: activity tonight.');
    expect(result).toContain(CHURCH_ACCOUNT_SUBSCRIPTIONS_URL);
  });

  it('does not duplicate the footer when already present', () => {
    const withFooter = appendEmailFooter('Body');
    expect(appendEmailFooter(withFooter)).toBe(withFooter);
  });
});
