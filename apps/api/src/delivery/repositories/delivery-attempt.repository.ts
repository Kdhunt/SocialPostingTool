import { Inject, Injectable } from '@nestjs/common';
import type { DeliveryAttempt, DeliveryAttemptStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class DeliveryAttemptRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: {
    deliveryRecipientId: string;
    attemptNumber: number;
    status: DeliveryAttemptStatus;
    providerMessageId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }): Promise<DeliveryAttempt> {
    return this.prisma.client.deliveryAttempt.create({ data: input });
  }
}
