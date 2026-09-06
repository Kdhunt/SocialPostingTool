import { describe, expect, it } from 'vitest';
import {
  deliveryBatchStatusLabel,
  deliveryRecipientStatusLabel,
  skipReasonLabel,
} from './display-labels';

describe('delivery status labels', () => {
  it('uses words, not color alone, for batch and recipient status', () => {
    expect(deliveryBatchStatusLabel('PartialFailure')).toBe('Partial failure');
    expect(deliveryRecipientStatusLabel('DeadLettered')).toBe('Dead lettered');
    expect(deliveryRecipientStatusLabel('Sent')).toBe('Sent');
  });

  it('explains skip reasons in plain language', () => {
    expect(skipReasonLabel('no_consent')).toBe('Consent not granted');
    expect(skipReasonLabel('no_contact_method')).toBe('No matching contact method');
  });
});
