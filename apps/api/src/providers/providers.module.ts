import { Module } from '@nestjs/common';
import { AudiencesModule } from '../audiences/audiences.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { FACEBOOK_GRAPH_ADAPTER, LiveFacebookGraphAdapter } from './facebook-graph.adapter.js';
import { FacebookPageConnectionService } from './facebook-page-connection.service.js';
import { FacebookPageController } from './facebook-page.controller.js';
import { ProviderCredentialsController } from './provider-credentials.controller.js';
import { ProviderCredentialRepository } from './provider-credential.repository.js';
import { ProviderCredentialsService } from './provider-credentials.service.js';

@Module({
  imports: [AuthModule, AppConfigModule, AudiencesModule],
  controllers: [ProviderCredentialsController, FacebookPageController],
  providers: [
    ProviderCredentialsService,
    ProviderCredentialRepository,
    FacebookPageConnectionService,
    {
      provide: FACEBOOK_GRAPH_ADAPTER,
      useFactory: (): LiveFacebookGraphAdapter => new LiveFacebookGraphAdapter(),
    },
  ],
  exports: [ProviderCredentialsService],
})
export class ProvidersModule {}
