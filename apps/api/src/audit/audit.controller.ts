import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { auditSearchQuerySchema, type AuditListResponse } from '@ward-comms/validation';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { AuditQueryService } from './audit-query.service.js';

@UseGuards(SessionAuthGuard, PermissionsGuard)
@RequirePermission('audit.read')
@Controller('audit')
export class AuditController {
  constructor(@Inject(AuditQueryService) private readonly audit: AuditQueryService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthContext['user'],
    @Query() query: Record<string, string | undefined>,
  ): Promise<AuditListResponse> {
    const parsed = auditSearchQuerySchema.parse(query);
    return this.audit.list(user.wardId, parsed);
  }
}
