import { describe, expect, it } from 'vitest';
import { expandDeliveryRecipients, type ExpansionContactMethod } from './recipient-expansion.js';

function emailMethod(personId: string, overrides: Partial<ExpansionContactMethod> = {}): ExpansionContactMethod {
  return {
    contactMethodId: `${personId}-email`,
    personId,
    type: 'Email',
    consentStatus: 'Granted',
    archivedAt: null,
    ...overrides,
  };
}

describe('expandDeliveryRecipients', () => {
  it('sends one Email to a person in two overlapping audiences', () => {
    const result = expandDeliveryRecipients({
      audienceMemberships: [
        { audienceGroupId: 'a', personIds: ['p1'] },
        { audienceGroupId: 'b', personIds: ['p1'] },
      ],
      destinations: [{ destinationId: 'd1', channel: 'Email' }],
      contactMethods: [emailMethod('p1')],
    });
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0]).toMatchObject({ kind: 'person', personId: 'p1', channel: 'Email' });
  });

  it('skips without consent and never infers from membership', () => {
    const result = expandDeliveryRecipients({
      audienceMemberships: [{ audienceGroupId: 'a', personIds: ['p1', 'p2'] }],
      destinations: [{ destinationId: 'd1', channel: 'Email' }],
      contactMethods: [emailMethod('p1'), emailMethod('p2', { consentStatus: 'Unknown' })],
    });
    expect(result.recipients).toHaveLength(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({ personId: 'p2', reason: 'no_consent' }),
    ]);
  });

  it('produces one FacebookPage recipient per destination, not per person', () => {
    const result = expandDeliveryRecipients({
      audienceMemberships: [{ audienceGroupId: 'a', personIds: ['p1', 'p2'] }],
      destinations: [{ destinationId: 'page-1', channel: 'FacebookPage' }],
      contactMethods: [],
    });
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0]).toMatchObject({ kind: 'page', destinationId: 'page-1' });
  });

  it('is deterministic across repeated calls', () => {
    const input = {
      audienceMemberships: [{ audienceGroupId: 'a', personIds: ['p1'] }],
      destinations: [{ destinationId: 'd1', channel: 'Email' as const }],
      contactMethods: [emailMethod('p1')],
    };
    expect(expandDeliveryRecipients(input).recipients[0]?.idempotencyKey).toBe(
      expandDeliveryRecipients(input).recipients[0]?.idempotencyKey,
    );
  });
});
