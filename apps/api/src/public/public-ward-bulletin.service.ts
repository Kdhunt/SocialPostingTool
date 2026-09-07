import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicWardBulletinResponse } from '@ward-comms/validation';
import {
  assertPublicWardSlug,
  comparePublicBulletinNewestFirst,
  isPublicBulletinCampaign,
  publicBulletinImageUrl,
  publicBulletinMessage,
  publicBulletinPublishedAt,
} from '@ward-comms/domain';
import { WardRepository } from '../admin/repositories/ward.repository.js';
import { CampaignRepository } from '../campaigns/repositories/campaign.repository.js';

@Injectable()
export class PublicWardBulletinService {
  constructor(
    @Inject(WardRepository) private readonly wards: WardRepository,
    @Inject(CampaignRepository) private readonly campaigns: CampaignRepository,
  ) {}

  async getBySlug(rawSlug: string): Promise<PublicWardBulletinResponse> {
    let slug: string;
    try {
      slug = assertPublicWardSlug(rawSlug);
    } catch {
      throw new NotFoundException('Ward page not found.');
    }

    const ward = await this.wards.findActiveByPublicSlug(slug);
    if (!ward) {
      throw new NotFoundException('Ward page not found.');
    }

    const rows = await this.campaigns.listPublishedForPublicBulletin(ward.id);
    const campaigns = rows
      .filter((row) => isPublicBulletinCampaign(row))
      .map((row) => {
        const version = row.versions[0];
        const batch = row.deliveryBatches[0];
        if (!batch) {
          return null;
        }
        return {
          id: row.id,
          name: row.name,
          publishedAt: publicBulletinPublishedAt(batch).toISOString(),
          message: publicBulletinMessage({
            baseMessage: version?.baseMessage ?? null,
            channelTexts: version?.channelVersions ?? [],
          }),
          imageUrl: publicBulletinImageUrl(version?.baseImageAsset?.storageReference),
          imageAltText: version?.baseImageAsset?.altText ?? null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => comparePublicBulletinNewestFirst(new Date(a.publishedAt), new Date(b.publishedAt)));

    return {
      wardName: ward.name,
      wardSlug: ward.publicSlug,
      timeZone: ward.timeZone,
      campaigns,
    };
  }
}
