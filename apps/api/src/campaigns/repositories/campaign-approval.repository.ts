import { Inject, Injectable } from '@nestjs/common';
import type { CampaignApproval, CampaignApprovalDecision } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Prisma-backed repository for CampaignApproval — append-only decision history. */
@Injectable()
export class CampaignApprovalRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForCampaign(campaignId: string): Promise<CampaignApproval[]> {
    return this.prisma.client.campaignApproval.findMany({ where: { campaignId }, orderBy: { decidedAt: 'desc' } });
  }

  async create(input: {
    campaignId: string;
    campaignVersionId: string;
    approverUserId: string;
    decision: CampaignApprovalDecision;
    comment?: string | null;
  }): Promise<CampaignApproval> {
    return this.prisma.client.campaignApproval.create({
      data: {
        campaignId: input.campaignId,
        campaignVersionId: input.campaignVersionId,
        approverUserId: input.approverUserId,
        decision: input.decision,
        comment: input.comment ?? null,
      },
    });
  }
}
