import { Inject, Injectable } from '@nestjs/common';
import type { CampaignSchedule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Prisma-backed repository for CampaignSchedule. */
@Injectable()
export class CampaignScheduleRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForCampaign(campaignId: string): Promise<CampaignSchedule[]> {
    return this.prisma.client.campaignSchedule.findMany({ where: { campaignId }, orderBy: { createdAt: 'desc' } });
  }

  async create(input: { campaignId: string; scheduledFor: Date; createdByUserId: string }): Promise<CampaignSchedule> {
    return this.prisma.client.campaignSchedule.create({
      data: { campaignId: input.campaignId, scheduledFor: input.scheduledFor, createdByUserId: input.createdByUserId },
    });
  }
}
