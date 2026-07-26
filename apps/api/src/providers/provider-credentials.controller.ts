import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  upsertProviderCredentialRequestSchema,
  type ProviderCredentialListResponse,
  type ProviderCredentialSummaryDto,
} from '@ward-comms/validation';
import { parseBody } from '../common/parse-body.util.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import {
  ProviderCredentialsService,
  type ProviderCredentialActionContext,
} from './provider-credentials.service.js';

function buildContext(user: AuthContext['user'], req: Request): ProviderCredentialActionContext {
  return { actorUserId: user.id, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('provider-credentials')
export class ProviderCredentialsController {
  constructor(
    @Inject(ProviderCredentialsService) private readonly credentials: ProviderCredentialsService,
  ) {}

  @RequirePermission('campaigns.send')
  @Get()
  async list(@CurrentUser() user: AuthContext['user']): Promise<ProviderCredentialListResponse> {
    return this.credentials.list(user.wardId);
  }

  @RequirePermission('campaigns.send')
  @Post()
  async upsert(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<ProviderCredentialSummaryDto> {
    const dto = parseBody(upsertProviderCredentialRequestSchema, body);
    return this.credentials.upsert(user.wardId, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.send')
  @Post(':id/revoke')
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.credentials.revoke(user.wardId, id, buildContext(user, req));
    return { ok: true };
  }
}
