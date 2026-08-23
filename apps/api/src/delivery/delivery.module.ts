import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { AudienceMemberRepository } from '../audiences/repositories/audience-member.repository.js';
import { CampaignRepository } from '../campaigns/repositories/campaign.repository.js';
import { CampaignVersionRepository } from '../campaigns/repositories/campaign-version.repository.js';
import { ContactMethodRepository } from '../directory/repositories/contact-method.repository.js';
import { DeliveryController } from './delivery.controller.js';
import { DeliveryQueueService } from './delivery-queue.service.js';
import { DeliveryService } from './delivery.service.js';
import { DeliveryAttemptRepository } from './repositories/delivery-attempt.repository.js';
import { DeliveryBatchRepository } from './repositories/delivery-batch.repository.js';
import { DeliveryRecipientRepository } from './repositories/delivery-recipient.repository.js';

@Module({
  imports: [AuthModule, AppConfigModule],
  controllers: [DeliveryController],
  providers: [
    DeliveryService,
    DeliveryQueueService,
    DeliveryBatchRepository,
    DeliveryRecipientRepository,
    DeliveryAttemptRepository,
    CampaignRepository,
    CampaignVersionRepository,
    AudienceMemberRepository,
    ContactMethodRepository,
  ],
  exports: [DeliveryService],
})
export class DeliveryModule {}
