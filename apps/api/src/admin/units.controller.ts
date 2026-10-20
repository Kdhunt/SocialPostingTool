import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createWardRequestSchema,
  resetPasswordRequestSchema,
  rotateWardCodeRequestSchema,
  setUnitParentRequestSchema,
  updateWardPublicSlugRequestSchema,
  type CreateWardResponse,
  type UnitTreeResponse,
  type WardCodeInfoDto,
  type WardSummaryDto,
} from '@ward-comms/validation';
import { parseBody } from '../common/parse-body.util.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { LoginRateLimiterService } from '../auth/login-rate-limiter.service.js';
import { UnitScopeService } from './unit-scope.service.js';
import { WardProvisioningService } from './ward-provisioning.service.js';
import type { AdminActionContext } from './users-admin.service.js';

function buildContext(user: AuthContext['user'], req: Request): AdminActionContext {
  return {
    actorUserId: user.id,
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

/**
 * Hierarchy management for unit admins: a stake admin manages its wards, a
 * region admin its stakes and their wards, a district admin everything below
 * it. Every route checks the target is strictly beneath the caller's unit.
 */
@UseGuards(SessionAuthGuard, PermissionsGuard)
@RequirePermission('units.manage')
@Controller('admin/units')
export class UnitsController {
  constructor(
    @Inject(WardProvisioningService) private readonly provisioning: WardProvisioningService,
    @Inject(UnitScopeService) private readonly scope: UnitScopeService,
    @Inject(LoginRateLimiterService) private readonly rateLimiter: LoginRateLimiterService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthContext['user']): Promise<UnitTreeResponse> {
    return this.provisioning.listBeneath(user.wardId);
  }

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CreateWardResponse> {
    this.assertRateLimit(
      `${req.ip}:${user.id}:unit-create`,
      'Too many unit creation attempts. Please wait and try again.',
    );
    const dto = parseBody(createWardRequestSchema, body);
    return this.provisioning.create(
      { ...dto, parentId: dto.parentId ?? user.wardId },
      buildContext(user, req),
      {
        kind: 'unit',
        unitId: user.wardId,
      },
    );
  }

  @Post(':unitId/parent')
  async setParent(
    @Param('unitId') unitId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<WardSummaryDto> {
    this.assertRateLimit(
      `${req.ip}:${user.id}:unit-parent`,
      'Too many hierarchy changes. Please wait and try again.',
    );
    const dto = parseBody(setUnitParentRequestSchema, body);
    return this.provisioning.setParent(
      unitId,
      dto,
      { kind: 'unit', unitId: user.wardId },
      buildContext(user, req),
    );
  }

  @Post(':unitId/public-slug')
  async updatePublicSlug(
    @Param('unitId') unitId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<WardSummaryDto> {
    await this.scope.assertBeneath(user.wardId, unitId);
    this.assertRateLimit(
      `${req.ip}:${user.id}:unit-slug`,
      'Too many public path updates. Please wait and try again.',
    );
    const dto = parseBody(updateWardPublicSlugRequestSchema, body);
    return this.provisioning.updatePublicSlug(unitId, dto, buildContext(user, req));
  }

  @Post(':unitId/code/rotate')
  async rotateCode(
    @Param('unitId') unitId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<WardCodeInfoDto> {
    await this.scope.assertBeneath(user.wardId, unitId);
    this.assertRateLimit(
      `${req.ip}:${user.id}:unit-rotate`,
      'Too many code changes. Please wait and try again.',
    );
    const dto = parseBody(rotateWardCodeRequestSchema, body);
    return this.provisioning.rotateWardCode(unitId, dto, buildContext(user, req));
  }

  @Post(':unitId/admins/:userId/password')
  @HttpCode(204)
  async resetAdminPassword(
    @Param('unitId') unitId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<void> {
    await this.scope.assertBeneath(user.wardId, unitId);
    this.assertRateLimit(
      `${req.ip}:${user.id}:unit-admin-password`,
      'Too many password reset attempts. Please wait and try again.',
    );
    const dto = parseBody(resetPasswordRequestSchema, body);
    await this.provisioning.resetWardAdminPassword(
      unitId,
      userId,
      dto.password,
      buildContext(user, req),
    );
  }

  @Post(':unitId/admins/:userId/password-reset-email')
  @HttpCode(204)
  async sendAdminPasswordResetEmail(
    @Param('unitId') unitId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<void> {
    await this.scope.assertBeneath(user.wardId, unitId);
    this.assertRateLimit(
      `${req.ip}:${user.id}:unit-admin-password-email`,
      'Too many password reset attempts. Please wait and try again.',
    );
    await this.provisioning.sendWardAdminPasswordResetEmail(
      unitId,
      userId,
      buildContext(user, req),
    );
  }

  private assertRateLimit(key: string, message: string): void {
    if (!this.rateLimiter.consume(key)) {
      throw new ForbiddenException(message);
    }
  }
}
