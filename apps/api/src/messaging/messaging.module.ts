import { Global, Module } from '@nestjs/common';
import type { AppConfig } from '@ward-comms/config';
import {
  createSystemEmailAdapter,
  systemEmailCredentialsFromConfig,
} from '@ward-comms/worker/system-email';
import { APP_CONFIG } from '../config/app-config.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AccountEmailService } from './account-email.service.js';
import { OutboundQueueService } from './outbound-queue.service.js';
import { TRANSACTIONAL_EMAIL_ADAPTER } from './transactional-email.tokens.js';

@Global()
@Module({
  imports: [AuthModule],
  providers: [
    OutboundQueueService,
    AccountEmailService,
    {
      provide: TRANSACTIONAL_EMAIL_ADAPTER,
      useFactory: (config: AppConfig) => {
        return createSystemEmailAdapter({
          mode: config.systemEmail.mode,
          credentials: systemEmailCredentialsFromConfig(config.systemEmail),
        });
      },
      inject: [APP_CONFIG],
    },
  ],
  exports: [AccountEmailService, OutboundQueueService, TRANSACTIONAL_EMAIL_ADAPTER],
})
export class MessagingModule {}
