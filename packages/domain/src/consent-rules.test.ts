import { describe, expect, it } from 'vitest';
import { isConsentedToSend } from './consent-rules.js';
import type { ConsentStatus } from './enums.js';

describe('isConsentedToSend', () => {
  it('only permits sending when consent is explicitly Granted', () => {
    expect(isConsentedToSend('Granted')).toBe(true);
  });

  it.each<ConsentStatus>(['Unknown', 'Denied', 'Withdrawn'])(
    'blocks sending when consent status is %s (never infer consent)',
    (status) => {
      expect(isConsentedToSend(status)).toBe(false);
    },
  );
});
