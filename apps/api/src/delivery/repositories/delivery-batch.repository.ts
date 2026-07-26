import { Inject, Injectable } from '@nestjs/common';
import type { DeliveryBatch, DeliveryBatchStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class DeliveryBatchRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByIdForWard(wardId: string, id: string): Promise<DeliveryBatch | null> {
    return this.prisma.client.deliveryBatch.findFirst({ where: { id, wardId } });
  }

  async findByIdempotencyKey(wardId: string, idempotencyKey: string): Promise<DeliveryBatch | null> {
    return this.prisma.client.deliveryBatch.findUnique({
      where: { wardId_idempotencyKey: { wardId, idempotencyKey } },
    });
  }

  async listForCampaign(campaignId: string): Promise<DeliveryBatch[]> {
    return this.prisma.client.deliveryBatch.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOrCreate(input: {
    wardId: string;
    campaignId: string;
    campaignVersionId: string;
    idempotencyKey: string;
    createdByUserId: string;
  }): Promise<{ batch: DeliveryBatch; wasCreated: boolean }> {
    const existing = await this.findByIdempotencyKey(input.wardId, input.idempotencyKey);
    if (existing) return { batch: existing, wasCreated: false };

    try {
      const created = await this.prisma.client.deliveryBatch.create({
        data: {
          wardId: input.wardId,
          campaignId: input.campaignId,
          campaignVersionId: input.campaignVersionId,
          idempotencyKey: input.idempotencyKey,
          createdByUserId: input.createdByUserId,
        },
      });
      return { batch: created, wasCreated: true };
    } catch {
      const racedWinner = await this.findByIdempotencyKey(input.wardId, input.idempotencyKey);
      if (racedWinner) return { batch: racedWinner, wasCreated: false };
      throw new Error('Failed to create or find delivery batch.');
    }
  }

  async setStatus(id: string, status: DeliveryBatchStatus, completedAt: Date | null): Promise<void> {
    await this.prisma.client.deliveryBatch.update({ where: { id }, data: { status, completedAt } });
  }

  async recomputeCounts(id: string): Promise<void> {
    const [totalRecipients, sentCount, deadLetteredCount, skippedCount] = await Promise.all([
      this.prisma.client.deliveryRecipient.count({ where: { deliveryBatchId: id } }),
      this.prisma.client.deliveryRecipient.count({ where: { deliveryBatchId: id, status: 'Sent' } }),
      this.prisma.client.deliveryRecipient.count({ where: { deliveryBatchId: id, status: 'DeadLettered' } }),
      this.prisma.client.deliveryRecipient.count({ where: { deliveryBatchId: id, status: 'Skipped' } }),
    ]);
    await this.prisma.client.deliveryBatch.update({
      where: { id },
      data: { totalRecipients, sentCount, deadLetteredCount, skippedCount },
    });
  }
}
