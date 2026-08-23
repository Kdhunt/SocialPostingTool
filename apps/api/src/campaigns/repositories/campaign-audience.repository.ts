import { Inject, Injectable } from '@nestjs/common';
import type { CampaignAudience } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Prisma-backed repository for CampaignAudience, scoped to a single CampaignVersion. */
@Injectable()
export class CampaignAudienceRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForVersion(campaignVersionId: string): Promise<CampaignAudience[]> {
    return this.prisma.client.campaignAudience.findMany({ where: { campaignVersionId } });
  }

  async add(input: {
    campaignVersionId: string;
    audienceGroupId: string;
    overrideText?: string | null;
    overrideImageAssetId?: string | null;
  }): Promise<CampaignAudience> {
    return this.prisma.client.campaignAudience.create({
      data: {
        campaignVersionId: input.campaignVersionId,
        audienceGroupId: input.audienceGroupId,
        overrideText: input.overrideText ?? null,
        overrideImageAssetId: input.overrideImageAssetId ?? null,
      },
    });
  }

  async update(
    campaignVersionId: string,
    audienceGroupId: string,
    input: { overrideText?: string | null; overrideImageAssetId?: string | null },
  ): Promise<CampaignAudience> {
    return this.prisma.client.campaignAudience.update({
      where: { campaignVersionId_audienceGroupId: { campaignVersionId, audienceGroupId } },
      data: input,
    });
  }

  async remove(campaignVersionId: string, audienceGroupId: string): Promise<void> {
    await this.prisma.client.campaignAudience.deleteMany({ where: { campaignVersionId, audienceGroupId } });
  }
}
