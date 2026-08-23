import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersAdminController, WardAdminController } from './admin.controller.js';
import { PlatformWardsController } from './platform.controller.js';
import { UsersAdminService } from './users-admin.service.js';
import { WardAdminService } from './ward-admin.service.js';
import { WardProvisioningService } from './ward-provisioning.service.js';
import { RoleRepository } from './repositories/role.repository.js';
import { WardRepository } from './repositories/ward.repository.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [UsersAdminController, WardAdminController, PlatformWardsController],
  providers: [UsersAdminService, WardAdminService, WardProvisioningService, RoleRepository, WardRepository],
})
export class AdminModule {}
