import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditController } from './audit.controller.js';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService],
})
export class AuditModule {}
