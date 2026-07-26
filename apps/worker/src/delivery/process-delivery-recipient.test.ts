import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@ward-comms/database';
import type { ProviderSendResult } from '@ward-comms/domain';
import { processDeliveryRecipient } from './process-delivery-recipient.js';

async function isDbAvailable(): Promise<boolean> {
  const prisma = createPrismaClient();
  try {
    await prisma.ward.findFirst();
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const databaseAvailable = await isDbAvailable();

describe.skipIf(!databaseAvailable)('processDeliveryRecipient — no duplicate sends on retry', () => {
  const prisma = createPrismaClient();
  let sendCallCount = 0;

  const providers = {
    email: {
      async send(): Promise<ProviderSendResult> {
        sendCallCount += 1;
        return { success: true, providerMessageId: `sim-${randomUUID()}` };
      },
    },
    sms: {
      async send(): Promise<ProviderSendResult> {
        sendCallCount += 1;
        return { success: true, providerMessageId: `sim-${randomUUID()}` };
      },
    },
    facebookPage: {
      async post(): Promise<ProviderSendResult> {
        sendCallCount += 1;
        return { success: true, providerMessageId: `sim-${randomUUID()}` };
      },
    },
  };

  let wardId = '';
  let recipientId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const ward = await prisma.ward.create({ data: { name: `Fictional Delivery Ward ${randomUUID()}` } });
    wardId = ward.id;
    const campaign = await prisma.campaign.create({
      data: { wardId, name: 'Fictional Delivery Campaign' },
    });
    const version = await prisma.campaignVersion.create({
      data: { campaignId: campaign.id, versionNumber: 1, baseMessage: 'Hello' },
    });
    const batch = await prisma.deliveryBatch.create({
      data: {
        wardId,
        campaignId: campaign.id,
        campaignVersionId: version.id,
        idempotencyKey: `batch:${campaign.id}:${version.id}`,
      },
    });
    const person = await prisma.person.create({
      data: { wardId, firstName: 'Fictional', lastName: 'Recipient', dateOfBirth: new Date('1990-01-01') },
    });
    const contact = await prisma.contactMethod.create({
      data: { personId: person.id, type: 'Email', value: 'fictional@example.test', isPrimary: true },
    });
    await prisma.contactConsent.create({
      data: { contactMethodId: contact.id, status: 'Granted', grantedAt: new Date() },
    });
    const recipient = await prisma.deliveryRecipient.create({
      data: {
        deliveryBatchId: batch.id,
        personId: person.id,
        channel: 'Email',
        contactMethodId: contact.id,
        idempotencyKey: `recipient:Email:person:${person.id}:contact:${contact.id}`,
        status: 'Pending',
        resolvedText: 'Hello',
      },
    });
    recipientId = recipient.id;
  });

  afterAll(async () => {
    if (wardId) {
      await prisma.auditEvent.deleteMany({ where: { wardId } });
      await prisma.deliveryAttempt.deleteMany({
        where: { deliveryRecipient: { deliveryBatch: { wardId } } },
      });
      await prisma.deliveryRecipient.deleteMany({ where: { deliveryBatch: { wardId } } });
      await prisma.deliveryBatch.deleteMany({ where: { wardId } });
      await prisma.contactConsent.deleteMany({ where: { contactMethod: { person: { wardId } } } });
      await prisma.contactMethod.deleteMany({ where: { person: { wardId } } });
      await prisma.campaignVersion.deleteMany({ where: { campaign: { wardId } } });
      await prisma.campaign.deleteMany({ where: { wardId } });
      await prisma.communicationDestination.deleteMany({ where: { wardId } });
      await prisma.person.deleteMany({ where: { wardId } });
      await prisma.ward.delete({ where: { id: wardId } });
    }
    await prisma.$disconnect();
  });

  it('calls the provider once when the same recipient job is processed twice', async () => {
    sendCallCount = 0;
    const deps = {
      prisma,
      providers,
      enqueueRetry: async (): Promise<void> => undefined,
    };

    const first = await processDeliveryRecipient(deps, recipientId);
    const second = await processDeliveryRecipient(deps, recipientId);

    expect(first).toBe('sent');
    expect(second).toBe('already_terminal');
    expect(sendCallCount).toBe(1);

    const attempts = await prisma.deliveryAttempt.findMany({ where: { deliveryRecipientId: recipientId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe('Succeeded');

    const recipient = await prisma.deliveryRecipient.findUniqueOrThrow({ where: { id: recipientId } });
    expect(recipient.status).toBe('Sent');
    expect(recipient.attemptCount).toBe(1);
  });

  it('does not duplicate a Facebook Page post on redelivery', async () => {
    sendCallCount = 0;
    const campaign = await prisma.campaign.findFirstOrThrow({ where: { wardId } });
    const version = await prisma.campaignVersion.findFirstOrThrow({ where: { campaignId: campaign.id } });
    const batch = await prisma.deliveryBatch.findFirstOrThrow({ where: { wardId } });
    const destination = await prisma.communicationDestination.create({
      data: { wardId, name: `Fictional Page ${randomUUID()}`, channel: 'FacebookPage' },
    });
    const pageRecipient = await prisma.deliveryRecipient.create({
      data: {
        deliveryBatchId: batch.id,
        channel: 'FacebookPage',
        destinationId: destination.id,
        idempotencyKey: `recipient:FacebookPage:destination:${destination.id}`,
        status: 'Pending',
        resolvedText: 'Page post',
      },
    });

    const deps = {
      prisma,
      providers,
      enqueueRetry: async (): Promise<void> => undefined,
    };
    expect(await processDeliveryRecipient(deps, pageRecipient.id)).toBe('sent');
    expect(await processDeliveryRecipient(deps, pageRecipient.id)).toBe('already_terminal');
    expect(sendCallCount).toBe(1);
    void version;
  });
});
