/**
 * Live-mode delivery against the real database and a fake SMTP server: the path production takes with
 * PROVIDER_MODE=live, from the stored (encrypted) ward credential through the SMTP adapter to the inbox. Also
 * checks that a provider failure or a thrown error always ends in a scheduled retry, never a row left in
 * "Sending" (which nothing reclaims). Fictional data only.
 */
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@ward-comms/database';
import type { ProviderSendResult } from '@ward-comms/domain';
import { CHURCH_ACCOUNT_SUBSCRIPTIONS_URL } from '../providers/communication-footer.js';
import { createDeliveryProviders, type CreateDeliveryProvidersOptions } from '../providers/create-delivery-providers.js';
import { encryptProviderSecret } from '../providers/credentials/cipher.js';
import { startFakeSmtpServer, type FakeSmtpServer } from '../providers/testing/fake-smtp-server.js';
import { processDeliveryRecipient, type DeliveryProviders } from './process-delivery-recipient.js';

const ENCRYPTION_KEY = 'fictional-provider-credentials-key-0123456789';
const ACCOUNT_REFERENCE = 'maple-hollow-email';
const MESSAGE = 'Fictional ward picnic this Saturday at 11am.';

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

describe.skipIf(!databaseAvailable)('live delivery through stored credentials', () => {
  const prisma = createPrismaClient();
  let smtp: FakeSmtpServer;
  let wardId = '';
  let batchId = '';
  let destinationId = '';
  let contactMethodId = '';
  let personId = '';
  const retries: Array<{ id: string; delayMs: number }> = [];

  const liveProviders = (): DeliveryProviders =>
    createDeliveryProviders({ mode: 'live', prisma, encryptionKey: ENCRYPTION_KEY } satisfies CreateDeliveryProvidersOptions);
  const deps = (providers: DeliveryProviders): Parameters<typeof processDeliveryRecipient>[0] => ({
    prisma,
    providers,
    enqueueRetry: async (id, delayMs) => {
      retries.push({ id, delayMs });
    },
  });

  async function storeSmtpCredential(port: number): Promise<void> {
    const encryptedPayload = encryptProviderSecret(
      JSON.stringify({
        provider: 'smtp',
        host: '127.0.0.1',
        port,
        user: 'fictional-smtp-user',
        pass: 'fictional-smtp-pass',
        fromAddress: 'maple-hollow@example.test',
      }),
      ENCRYPTION_KEY,
    );
    await prisma.providerCredential.upsert({
      where: {
        wardId_channel_providerAccountReference: { wardId, channel: 'Email', providerAccountReference: ACCOUNT_REFERENCE },
      },
      create: { wardId, channel: 'Email', providerAccountReference: ACCOUNT_REFERENCE, encryptedPayload },
      update: { encryptedPayload },
    });
  }

  async function newRecipient(): Promise<string> {
    const recipient = await prisma.deliveryRecipient.create({
      data: {
        deliveryBatchId: batchId,
        personId,
        channel: 'Email',
        destinationId,
        contactMethodId,
        idempotencyKey: `recipient:Email:${randomUUID()}`,
        status: 'Pending',
        resolvedText: MESSAGE,
      },
    });
    return recipient.id;
  }

  beforeAll(async () => {
    smtp = await startFakeSmtpServer({ credentials: { user: 'fictional-smtp-user', pass: 'fictional-smtp-pass' } });
    await prisma.$connect();
    const ward = await prisma.ward.create({
      data: { name: `Fictional Live Delivery Ward ${randomUUID()}`, publicSlug: `w${randomUUID().replace(/-/g, '')}` },
    });
    wardId = ward.id;
    const campaign = await prisma.campaign.create({ data: { wardId, name: 'Fictional Live Campaign' } });
    const version = await prisma.campaignVersion.create({
      data: { campaignId: campaign.id, versionNumber: 1, baseMessage: MESSAGE },
    });
    const batch = await prisma.deliveryBatch.create({
      data: {
        wardId,
        campaignId: campaign.id,
        campaignVersionId: version.id,
        idempotencyKey: `batch:${campaign.id}:${version.id}`,
      },
    });
    batchId = batch.id;
    const person = await prisma.person.create({
      data: { wardId, firstName: 'Aaron', lastName: 'Abernathy', dateOfBirth: new Date('1985-04-02') },
    });
    personId = person.id;
    const contact = await prisma.contactMethod.create({
      data: { personId, type: 'Email', value: 'aaron.abernathy@example.test', isPrimary: true },
    });
    contactMethodId = contact.id;
    await prisma.contactConsent.create({
      data: { contactMethodId, status: 'Granted', grantedAt: new Date() },
    });
    const destination = await prisma.communicationDestination.create({
      data: { wardId, name: 'Fictional ward newsletter', channel: 'Email', providerAccountReference: ACCOUNT_REFERENCE },
    });
    destinationId = destination.id;
    await storeSmtpCredential(smtp.port);
  });

  afterAll(async () => {
    await smtp?.close();
    if (wardId) {
      await prisma.auditEvent.deleteMany({ where: { wardId } });
      await prisma.deliveryAttempt.deleteMany({ where: { deliveryRecipient: { deliveryBatch: { wardId } } } });
      await prisma.deliveryRecipient.deleteMany({ where: { deliveryBatch: { wardId } } });
      await prisma.deliveryBatch.deleteMany({ where: { wardId } });
      await prisma.contactConsent.deleteMany({ where: { contactMethod: { person: { wardId } } } });
      await prisma.contactMethod.deleteMany({ where: { person: { wardId } } });
      await prisma.campaignVersion.deleteMany({ where: { campaign: { wardId } } });
      await prisma.campaign.deleteMany({ where: { wardId } });
      await prisma.providerCredential.deleteMany({ where: { wardId } });
      await prisma.communicationDestination.deleteMany({ where: { wardId } });
      await prisma.person.deleteMany({ where: { wardId } });
      await prisma.ward.delete({ where: { id: wardId } });
    }
    await prisma.$disconnect();
  });

  it('decrypts the ward’s SMTP credential and delivers exactly one email, even if the job runs twice', async () => {
    const recipientId = await newRecipient();
    const before = smtp.messages.length;

    expect(await processDeliveryRecipient(deps(liveProviders()), recipientId)).toBe('sent');
    expect(await processDeliveryRecipient(deps(liveProviders()), recipientId)).toBe('already_terminal');

    const received = smtp.messages.slice(before);
    expect(received).toHaveLength(1);
    expect(received[0]?.authUser).toBe('fictional-smtp-user');
    expect(received[0]?.from).toBe('maple-hollow@example.test');
    expect(received[0]?.to).toEqual(['aaron.abernathy@example.test']);
    expect(received[0]?.body.startsWith(MESSAGE)).toBe(true);
    expect(received[0]?.body).toContain(CHURCH_ACCOUNT_SUBSCRIPTIONS_URL);

    const recipient = await prisma.deliveryRecipient.findUniqueOrThrow({
      where: { id: recipientId },
      include: { attempts: true },
    });
    expect(recipient.status).toBe('Sent');
    expect(recipient.attempts).toHaveLength(1);
    expect(recipient.attempts[0]).toMatchObject({ status: 'Succeeded' });
    expect(recipient.attempts[0]?.providerMessageId).toBeTruthy();
  });

  it('schedules a retry when the mail server is down, and delivers once it is back', async () => {
    const recipientId = await newRecipient();
    await storeSmtpCredential(await unusedPort());
    retries.length = 0;

    expect(await processDeliveryRecipient(deps(liveProviders()), recipientId)).toBe('retry_scheduled');
    const afterFailure = await prisma.deliveryRecipient.findUniqueOrThrow({
      where: { id: recipientId },
      include: { attempts: true },
    });
    expect(afterFailure.status).toBe('Retrying');
    expect(afterFailure.attempts[0]).toMatchObject({ status: 'Failed', errorCode: 'provider_unavailable' });
    expect(retries).toEqual([{ id: recipientId, delayMs: expect.any(Number) as number }]);

    await storeSmtpCredential(smtp.port);
    const before = smtp.messages.length;
    expect(await processDeliveryRecipient(deps(liveProviders()), recipientId)).toBe('sent');
    expect(smtp.messages.length - before).toBe(1);
  });

  it('turns a provider that throws into a scheduled retry instead of leaving the row in Sending', async () => {
    const recipientId = await newRecipient();
    retries.length = 0;
    const throwing: DeliveryProviders = {
      email: {
        async send(): Promise<ProviderSendResult> {
          throw new TypeError('fetch failed');
        },
      },
      sms: { send: async () => ({ success: true, providerMessageId: 'unused' }) },
      facebookPage: { post: async () => ({ success: true, providerMessageId: 'unused' }) },
    };

    expect(await processDeliveryRecipient(deps(throwing), recipientId)).toBe('retry_scheduled');
    const recipient = await prisma.deliveryRecipient.findUniqueOrThrow({
      where: { id: recipientId },
      include: { attempts: true },
    });
    expect(recipient.status).toBe('Retrying');
    expect(recipient.attempts[0]).toMatchObject({ status: 'Failed', errorCode: 'provider_unavailable' });
    expect(recipient.attempts[0]?.errorMessage).toBe('The Email provider call failed unexpectedly (TypeError).');
    expect(retries).toHaveLength(1);
  });
});

async function unusedPort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}
