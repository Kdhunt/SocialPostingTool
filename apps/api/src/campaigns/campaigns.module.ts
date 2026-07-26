import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AiImageModule } from '../ai/ai-image.module.js';
import { AudienceGroupRepository } from '../audiences/repositories/audience-group.repository.js';
import { AudienceMemberRepository } from '../audiences/repositories/audience-member.repository.js';
import { PersonRepository } from '../directory/repositories/person.repository.js';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { CampaignsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';
import { CampaignApprovalRepository } from './repositories/campaign-approval.repository.js';
import { CampaignAssetRepository } from './repositories/campaign-asset.repository.js';
import { CampaignAudienceRepository } from './repositories/campaign-audience.repository.js';
import { CampaignChannelVersionRepository } from './repositories/campaign-channel-version.repository.js';
import { CampaignDestinationRepository } from './repositories/campaign-destination.repository.js';
import { CampaignRepository } from './repositories/campaign.repository.js';
import { CampaignScheduleRepository } from './repositories/campaign-schedule.repository.js';
import { CampaignVersionRepository } from './repositories/campaign-version.repository.js';

@Module({
  imports: [AuthModule, DeliveryModule, AiImageModule],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    CampaignRepository,
    CampaignVersionRepository,
    CampaignAssetRepository,
    CampaignAudienceRepository,
    CampaignChannelVersionRepository,
    CampaignDestinationRepository,
    CampaignApprovalRepository,
    CampaignScheduleRepository,
    AudienceGroupRepository,
    AudienceMemberRepository,
    PersonRepository,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
