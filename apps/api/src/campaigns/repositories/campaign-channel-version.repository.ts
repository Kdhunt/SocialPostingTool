import { Inject, Injectable } from '@nestjs/common';
import type { CampaignChannelVersion, CommunicationChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Prisma-backed repository for CampaignChannelVersion (per-channel text override for one campaign version). */
@Injectable()
export class CampaignChannelVersionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async upsert(campaignVersionId: string, channel: CommunicationChannel, text: string): Promise<CampaignChannelVersion> {
    return this.prisma.client.campaignChannelVersion.upsert({
      where: { campaignVersionId_channel: { campaignVersionId, channel } },
      create: { campaignVersionId, channel, text },
      update: { text },
    });
  }

  async remove(campaignVersionId: string, channel: CommunicationChannel): Promise<void> {
    await this.prisma.client.campaignChannelVersion.deleteMany({ where: { campaignVersionId, channel } });
  }
}
