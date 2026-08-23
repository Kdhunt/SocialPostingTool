import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PersonRepository } from '../directory/repositories/person.repository.js';
import { AudiencesController } from './audiences.controller.js';
import { DestinationsController } from './destinations.controller.js';
import { AudiencesService } from './audiences.service.js';
import { AudienceGroupRepository } from './repositories/audience-group.repository.js';
import { AudienceMemberRepository } from './repositories/audience-member.repository.js';
import { AudienceDestinationRepository } from './repositories/audience-destination.repository.js';
import { CommunicationDestinationRepository } from './repositories/communication-destination.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [AudiencesController, DestinationsController],
  providers: [
    AudiencesService,
    AudienceGroupRepository,
    AudienceMemberRepository,
    AudienceDestinationRepository,
    CommunicationDestinationRepository,
    PersonRepository,
  ],
  exports: [AudiencesService],
})
export class AudiencesModule {}
