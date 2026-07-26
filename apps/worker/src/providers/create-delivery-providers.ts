import type { PrismaClient } from '@ward-comms/database';
import type { CommunicationChannel } from '@ward-comms/domain';
import type { DeliveryProviders } from '../delivery/process-delivery-recipient.js';
import type { ProviderCredentialLookup, StoredProviderCredential } from './credentials/types.js';
import { CredentialedEmailProviderAdapter } from './email/credentialed-email.adapter.js';
import { SimulatedEmailProviderAdapter } from './email/simulated-email.adapter.js';
import { CredentialedFacebookPageProviderAdapter } from './facebook/credentialed-facebook-page.adapter.js';
import { SimulatedFacebookPageProviderAdapter } from './facebook/simulated-facebook-page.adapter.js';
import { CredentialedSmsProviderAdapter } from './sms/credentialed-sms.adapter.js';
import { SimulatedSmsProviderAdapter } from './sms/simulated-sms.adapter.js';

export class PrismaProviderCredentialLookup implements ProviderCredentialLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async findActive(
    wardId: string,
    channel: CommunicationChannel,
    providerAccountReference: string,
  ): Promise<StoredProviderCredential | null> {
    const row = await this.prisma.providerCredential.findUnique({
      where: {
        wardId_channel_providerAccountReference: {
          wardId,
          channel,
          providerAccountReference,
        },
      },
    });
    if (!row) return null;
    return {
      channel: row.channel,
      providerAccountReference: row.providerAccountReference,
      encryptedPayload: row.encryptedPayload,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }
}

export interface CreateDeliveryProvidersOptions {
  mode: 'simulated' | 'credentialed';
  prisma: PrismaClient;
  encryptionKey: string;
}

/**
 * Builds the Email/SMS/Facebook adapters used by the delivery worker.
 * Provider SDKs stay behind this factory — never in `packages/domain`.
 */
export function createDeliveryProviders(options: CreateDeliveryProvidersOptions): DeliveryProviders {
  if (options.mode === 'simulated') {
    return {
      email: new SimulatedEmailProviderAdapter(),
      sms: new SimulatedSmsProviderAdapter(),
      facebookPage: new SimulatedFacebookPageProviderAdapter(),
    };
  }

  const lookup = new PrismaProviderCredentialLookup(options.prisma);
  return {
    email: new CredentialedEmailProviderAdapter(options.prisma, lookup, options.encryptionKey),
    sms: new CredentialedSmsProviderAdapter(options.prisma, lookup, options.encryptionKey),
    facebookPage: new CredentialedFacebookPageProviderAdapter(
      options.prisma,
      lookup,
      options.encryptionKey,
    ),
  };
}
