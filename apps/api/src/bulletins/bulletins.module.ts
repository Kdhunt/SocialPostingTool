import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WardRepository } from '../admin/repositories/ward.repository.js';
import { BulletinsController, UnitOrganizationsController } from './bulletins.controller.js';
import { BulletinsService } from './bulletins.service.js';
import { UnitOrganizationsService } from './unit-organizations.service.js';
import { BulletinRepository } from './repositories/bulletin.repository.js';
import { UnitOrganizationRepository } from './repositories/unit-organization.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [BulletinsController, UnitOrganizationsController],
  providers: [
    BulletinsService,
    UnitOrganizationsService,
    BulletinRepository,
    UnitOrganizationRepository,
    WardRepository,
  ],
  exports: [BulletinsService],
})
export class BulletinsModule {}
