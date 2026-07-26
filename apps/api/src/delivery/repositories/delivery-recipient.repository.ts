import { Inject, Injectable } from '@nestjs/common';
import type { DeliveryAttempt, DeliveryRecipient, DeliveryRecipientStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type DeliveryRecipientWithAttempts = DeliveryRecipient & { attempts: DeliveryAttempt[] };

export interface CreateDeliveryRecipientInput {
  id?: string;
  deliveryBatchId: string;
  personId: string | null;
  channel: 'Email' | 'Sms' | 'FacebookPage';
  destinationId: string | null;
  contactMethodId: string | null;
  sourceAudienceGroupId: string | null;
  idempotencyKey: string;
  status: 'Pending' | 'Skipped';
  skipReason: string | null;
  resolvedText?: string | null;
  resolvedImageAssetId?: string | null;
}

@Injectable()
export class DeliveryRecipientRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createMany(recipients: CreateDeliveryRecipientInput[]): Promise<number> {
    if (recipients.length === 0) return 0;
    const result = await this.prisma.client.deliveryRecipient.createMany({
      data: recipients,
      skipDuplicates: true,
    });
    return result.count;
  }

  async listForBatch(deliveryBatchId: string): Promise<DeliveryRecipientWithAttempts[]> {
    return this.prisma.client.deliveryRecipient.findMany({
      where: { deliveryBatchId },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async transitionStatus(
    id: string,
    fromStatuses: DeliveryRecipientStatus[],
    toStatus: DeliveryRecipientStatus,
    extra: Prisma.DeliveryRecipientUpdateManyMutationInput = {},
  ): Promise<boolean> {
    const result = await this.prisma.client.deliveryRecipient.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extra },
    });
    return result.count > 0;
  }
}
