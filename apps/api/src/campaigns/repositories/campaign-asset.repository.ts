import { Inject, Injectable } from '@nestjs/common';
import type { CampaignAsset } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Prisma-backed repository for CampaignAsset (images used as base or audience-override content). */
@Injectable()
export class CampaignAssetRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByIdForCampaign(campaignId: string, id: string): Promise<CampaignAsset | null> {
    return this.prisma.client.campaignAsset.findFirst({ where: { id, campaignId } });
  }

  async create(input: { campaignId: string; storageReference: string; contentType: string; altText: string }): Promise<CampaignAsset> {
    return this.prisma.client.campaignAsset.create({
      data: {
        campaignId: input.campaignId,
        storageReference: input.storageReference,
        contentType: input.contentType,
        altText: input.altText,
      },
    });
  }
}
