import { Module } from '@nestjs/common';
import { WardRepository } from '../admin/repositories/ward.repository.js';
import { CampaignRepository } from '../campaigns/repositories/campaign.repository.js';
import { PublicReadRateLimiterService } from './public-read-rate-limiter.service.js';
import { PublicWardBulletinController } from './public-ward-bulletin.controller.js';
import { PublicWardBulletinService } from './public-ward-bulletin.service.js';

@Module({
  controllers: [PublicWardBulletinController],
  providers: [PublicWardBulletinService, PublicReadRateLimiterService, WardRepository, CampaignRepository],
})
export class PublicModule {}
