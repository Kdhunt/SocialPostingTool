import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PublicWardBulletinService } from './public-ward-bulletin.service.js';
import type { WardRepository } from '../admin/repositories/ward.repository.js';
import type { CampaignRepository } from '../campaigns/repositories/campaign.repository.js';

describe('PublicWardBulletinService', () => {
  it('lists sent campaigns for the matching public slug, newest first', async () => {
    const wards = {
      findActiveByPublicSlug: vi.fn().mockResolvedValue({
        id: 'ward-a',
        name: 'Fictional Grange Creek',
        publicSlug: 'grangecreek',
        timeZone: 'America/Denver',
        archivedAt: null,
      }),
    } as unknown as WardRepository;
    const campaigns = {
      listPublishedForPublicBulletin: vi.fn().mockResolvedValue([
        {
          id: 'older',
          name: 'Fictional Older Post',
          status: 'Sent',
          archivedAt: null,
          versions: [{ baseMessage: 'Older message', channelVersions: [], baseImageAsset: null }],
          deliveryBatches: [{ createdAt: new Date('2026-01-01T00:00:00.000Z'), completedAt: null }],
        },
        {
          id: 'newer',
          name: 'Fictional Newer Post',
          status: 'Sent',
          archivedAt: null,
          versions: [{ baseMessage: 'Newer message', channelVersions: [], baseImageAsset: null }],
          deliveryBatches: [{ createdAt: new Date('2026-03-01T00:00:00.000Z'), completedAt: null }],
        },
      ]),
    } as unknown as CampaignRepository;

    const service = new PublicWardBulletinService(wards, campaigns);
    const result = await service.getBySlug('grangecreek');

    expect(wards.findActiveByPublicSlug).toHaveBeenCalledWith('grangecreek');
    expect(result.wardName).toBe('Fictional Grange Creek');
    expect(result.campaigns.map((row) => row.id)).toEqual(['newer', 'older']);
    expect(result.campaigns[0]?.publishedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('returns the same not-found message for reserved and unknown slugs', async () => {
    const wards = {
      findActiveByPublicSlug: vi.fn().mockResolvedValue(null),
    } as unknown as WardRepository;
    const campaigns = {
      listPublishedForPublicBulletin: vi.fn(),
    } as unknown as CampaignRepository;
    const service = new PublicWardBulletinService(wards, campaigns);

    await expect(service.getBySlug('login')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getBySlug('unknownwardzz')).rejects.toBeInstanceOf(NotFoundException);
    expect(campaigns.listPublishedForPublicBulletin).not.toHaveBeenCalled();
  });
});
