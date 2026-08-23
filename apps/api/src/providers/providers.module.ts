import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { ProviderCredentialsController } from './provider-credentials.controller.js';
import { ProviderCredentialRepository } from './provider-credential.repository.js';
import { ProviderCredentialsService } from './provider-credentials.service.js';

@Module({
  imports: [AuthModule, AppConfigModule],
  controllers: [ProviderCredentialsController],
  providers: [ProviderCredentialsService, ProviderCredentialRepository],
  exports: [ProviderCredentialsService],
})
export class ProvidersModule {}
