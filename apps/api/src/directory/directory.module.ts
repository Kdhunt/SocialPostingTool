import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DirectoryController } from './directory.controller.js';
import { DirectoryService } from './directory.service.js';
import { ContactMethodRepository } from './repositories/contact-method.repository.js';
import { HouseholdMembershipRepository } from './repositories/household-membership.repository.js';
import { HouseholdRepository } from './repositories/household.repository.js';
import { PersonRepository } from './repositories/person.repository.js';
import { RelationshipRepository } from './repositories/relationship.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [DirectoryController],
  providers: [
    DirectoryService,
    PersonRepository,
    HouseholdRepository,
    ContactMethodRepository,
    RelationshipRepository,
    HouseholdMembershipRepository,
  ],
  exports: [DirectoryService],
})
export class DirectoryModule {}
