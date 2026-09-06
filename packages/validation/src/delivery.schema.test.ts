import { describe, expect, it } from 'vitest';
import { deliveryBatchDetailSchema } from './delivery.schema.js';

describe('deliveryBatchDetailSchema', () => {
  it('requires a display name for each recipient so operators are not shown raw ids', () => {
    const parsed = deliveryBatchDetailSchema.parse({
      id: 'batch-1',
      campaignId: 'campaign-1',
      campaignVersionId: 'version-1',
      status: 'Pending',
      totalRecipients: 1,
      sentCount: 0,
      deadLetteredCount: 0,
      skippedCount: 0,
      createdAt: '2026-09-06T09:52:47.000Z',
      completedAt: null,
      recipients: [
        {
          id: 'recipient-1',
          personId: 'person-1',
          displayName: 'Fictional Alex',
          channel: 'Email',
          destinationId: 'dest-1',
          status: 'Pending',
          skipReason: null,
          attemptCount: 0,
          attempts: [],
        },
      ],
    });
    expect(parsed.recipients[0]?.displayName).toBe('Fictional Alex');
  });

  it('rejects a recipient row without a display name', () => {
    expect(() =>
      deliveryBatchDetailSchema.parse({
        id: 'batch-1',
        campaignId: 'campaign-1',
        campaignVersionId: 'version-1',
        status: 'Pending',
        totalRecipients: 1,
        sentCount: 0,
        deadLetteredCount: 0,
        skippedCount: 0,
        createdAt: '2026-09-06T09:52:47.000Z',
        completedAt: null,
        recipients: [
          {
            id: 'recipient-1',
            personId: 'person-1',
            channel: 'Email',
            destinationId: 'dest-1',
            status: 'Pending',
            skipReason: null,
            attemptCount: 0,
            attempts: [],
          },
        ],
      }),
    ).toThrow();
  });
});
