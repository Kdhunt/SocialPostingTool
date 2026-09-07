import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  createWardRequestSchema,
  resetPasswordRequestSchema,
  rotateWardCodeRequestSchema,
  updateWardPublicSlugRequestSchema,
  type CreateWardResponse,
  type WardCodeInfoDto,
  type WardListResponse,
  type WardSummaryDto,
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
    this.assertRateLimit(`${req.ip}:platform-ward-create`, 'Too many ward creation attempts. Please wait and try again.');
    const dto = parseBody(createWardRequestSchema, body);
    return this.provisioning.create(dto, buildContext(user, req));
  }

  @Post(':wardId/public-slug')
  async updatePublicSlug(
    @Param('wardId') wardId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<WardSummaryDto> {
    this.assertRateLimit(`${req.ip}:platform-ward-slug`, 'Too many public path updates. Please wait and try again.');
    const dto = parseBody(updateWardPublicSlugRequestSchema, body);
    return this.provisioning.updatePublicSlug(wardId, dto, buildContext(user, req));
  }

  @Post(':wardId/code/rotate')
  async rotateCode(
    @Param('wardId') wardId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<WardCodeInfoDto> {
    this.assertRateLimit(`${req.ip}:platform-ward-rotate`, 'Too many ward code rotation attempts. Please wait and try again.');
    const dto = parseBody(rotateWardCodeRequestSchema, body);
    return this.provisioning.rotateWardCode(wardId, dto, buildContext(user, req));
  }

  @Post(':wardId/admins/:userId/password')
  @HttpCode(204)
  async resetAdminPassword(
    @Param('wardId') wardId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<void> {
    this.assertRateLimit(
      `${req.ip}:platform-ward-admin-password`,
      'Too many password reset attempts. Please wait and try again.',
    );
    const dto = parseBody(resetPasswordRequestSchema, body);
    await this.provisioning.resetWardAdminPassword(wardId, userId, dto.password, buildContext(user, req));
  }

  @Post(':wardId/admins/:userId/password-reset-email')
  @HttpCode(204)
  async sendAdminPasswordResetEmail(
    @Param('wardId') wardId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<void> {
    this.assertRateLimit(
      `${req.ip}:platform-ward-admin-password-email`,
      'Too many password reset attempts. Please wait and try again.',
    );
    await this.provisioning.sendWardAdminPasswordResetEmail(wardId, userId, buildContext(user, req));
  }

  private assertRateLimit(key: string, message: string): void {
    if (!this.rateLimiter.consume(key)) {
      throw new ForbiddenException(message);
    }
  }
}
