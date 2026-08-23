import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

const models = Prisma.dmmf.datamodel.models;

function getModel(name: string): Prisma.DMMF.Model {
  const model = models.find((candidate) => candidate.name === name);
  if (!model) throw new Error(`Expected model "${name}" to exist.`);
  return model;
}

describe('Prisma schema — Phase 8 delivery entities', () => {
  it.each(['DeliveryBatch', 'DeliveryRecipient', 'DeliveryAttempt'])('defines %s', (name) => {
    expect(() => getModel(name)).not.toThrow();
  });

  it('uniquely keys batches by ward + idempotencyKey', () => {
    const batch = getModel('DeliveryBatch');
    expect(
      batch.uniqueIndexes.some(
        (index) => index.fields.includes('wardId') && index.fields.includes('idempotencyKey'),
      ),
    ).toBe(true);
  });

  it('uniquely keys recipients by batch + idempotencyKey', () => {
    const recipient = getModel('DeliveryRecipient');
    expect(
      recipient.uniqueIndexes.some(
        (index) =>
          index.fields.includes('deliveryBatchId') && index.fields.includes('idempotencyKey'),
      ),
    ).toBe(true);
  });
});
