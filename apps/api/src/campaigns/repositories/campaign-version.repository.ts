import { Inject, Injectable } from '@nestjs/common';
import type { CampaignVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type CampaignVersionWithDetails = CampaignVersion & {
  channelVersions: { channel: string; text: string }[];
  audiences: {
    id: string;
    audienceGroupId: string;
    overrideText: string | null;
    overrideImageAssetId: string | null;
    audienceGroup: { name: string };
  }[];
  destinations: {
    destinationId: string;
    destination: { id: string; name: string; channel: string; archivedAt: Date | null };
  }[];
};

/**
 * Prisma-backed repository for CampaignVersion. A campaign's current
 * version is always the row with the highest `versionNumber` for that
 * `campaignId` — there is no separate "isCurrent" flag to keep in sync.
 */
@Injectable()
export class CampaignVersionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findCurrentForCampaign(campaignId: string): Promise<CampaignVersionWithDetails | null> {
    return this.prisma.client.campaignVersion.findFirst({
      where: { campaignId },
      orderBy: { versionNumber: 'desc' },
      include: {
        channelVersions: { select: { channel: true, text: true } },
        audiences: { include: { audienceGroup: { select: { name: true } } } },
        destinations: {
          select: { destinationId: true, destination: { select: { id: true, name: true, channel: true, archivedAt: true } } },
        },
      },
    });
  }

  async findByIdForCampaign(campaignId: string, versionId: string): Promise<CampaignVersionWithDetails | null> {
    return this.prisma.client.campaignVersion.findFirst({
      where: { id: versionId, campaignId },
      include: {
        channelVersions: { select: { channel: true, text: true } },
        audiences: { include: { audienceGroup: { select: { name: true } } } },
        destinations: {
          select: { destinationId: true, destination: { select: { id: true, name: true, channel: true, archivedAt: true } } },
        },
      },
    });
  }

  async create(input: {
    campaignId: string;
    versionNumber: number;
    baseMessage?: string | null;
    baseImageAssetId?: string | null;
    createdByUserId: string;
  }): Promise<CampaignVersion> {
    return this.prisma.client.campaignVersion.create({
      data: {
        campaignId: input.campaignId,
        versionNumber: input.versionNumber,
        baseMessage: input.baseMessage ?? null,
        baseImageAssetId: input.baseImageAssetId ?? null,
        createdByUserId: input.createdByUserId,
      },
    });
  }

  async updateContent(id: string, input: { baseMessage?: string | null; baseImageAssetId?: string | null }): Promise<CampaignVersion> {
    return this.prisma.client.campaignVersion.update({ where: { id }, data: input });
  }
}
