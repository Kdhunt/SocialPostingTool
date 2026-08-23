import { Inject, Injectable } from '@nestjs/common';
import type { CommunicationChannel, ProviderCredential } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProviderCredentialRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForWard(wardId: string): Promise<ProviderCredential[]> {
    return this.prisma.client.providerCredential.findMany({
      where: { wardId },
      orderBy: [{ channel: 'asc' }, { providerAccountReference: 'asc' }],
    });
  }

  async upsert(input: {
    wardId: string;
    channel: CommunicationChannel;
    providerAccountReference: string;
    encryptedPayload: string;
    encryptionKeyId: string;
    expiresAt: Date | null;
  }): Promise<ProviderCredential> {
    return this.prisma.client.providerCredential.upsert({
      where: {
        wardId_channel_providerAccountReference: {
          wardId: input.wardId,
          channel: input.channel,
          providerAccountReference: input.providerAccountReference,
        },
      },
      create: {
        wardId: input.wardId,
        channel: input.channel,
        providerAccountReference: input.providerAccountReference,
        encryptedPayload: input.encryptedPayload,
        encryptionKeyId: input.encryptionKeyId,
        expiresAt: input.expiresAt,
        revokedAt: null,
      },
      update: {
        encryptedPayload: input.encryptedPayload,
        encryptionKeyId: input.encryptionKeyId,
        expiresAt: input.expiresAt,
        revokedAt: null,
      },
    });
  }

  async revoke(wardId: string, id: string): Promise<void> {
    await this.prisma.client.providerCredential.updateMany({
      where: { id, wardId },
      data: { revokedAt: new Date() },
    });
  }
}
