import { Body, Controller, ForbiddenException, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  createWardRequestSchema,
  type CreateWardResponse,
  type WardListResponse,
} from '@ward-comms/validation';
import { parseBody } from '../common/parse-body.util.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { LoginRateLimiterService } from '../auth/login-rate-limiter.service.js';
import { WardProvisioningService } from './ward-provisioning.service.js';
import type { AdminActionContext } from './users-admin.service.js';

function buildContext(user: AuthContext['user'], req: Request): AdminActionContext {
  return { actorUserId: user.id, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@UseGuards(SessionAuthGuard, PermissionsGuard)
@RequirePermission('platform.wards.manage')
@Controller('platform/wards')
export class PlatformWardsController {
  constructor(
    @Inject(WardProvisioningService) private readonly provisioning: WardProvisioningService,
    @Inject(LoginRateLimiterService) private readonly rateLimiter: LoginRateLimiterService,
  ) {}

  @Get()
  async list(): Promise<WardListResponse> {
    return this.provisioning.list();
  }

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CreateWardResponse> {
    const rateLimitKey = `${req.ip}:platform-ward-create`;
    if (!this.rateLimiter.consume(rateLimitKey)) {
      throw new ForbiddenException('Too many ward creation attempts. Please wait and try again.');
    }

    const dto = parseBody(createWardRequestSchema, body);
    return this.provisioning.create(dto, buildContext(user, req));
  }
}
