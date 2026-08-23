import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DirectoryModule } from './directory/directory.module.js';
import { AudiencesModule } from './audiences/audiences.module.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { AdminModule } from './admin/admin.module.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    DirectoryModule,
    AudiencesModule,
    CampaignsModule,
    DeliveryModule,
    ProvidersModule,
    AdminModule,
  ],
})
export class AppModule {}
