import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  addAudienceDestinationRequestSchema,
  addAudienceMemberRequestSchema,
  audiencePreviewRequestSchema,
  audienceSearchQuerySchema,
  createAudienceGroupRequestSchema,
  setAudienceRulesRequestSchema,
  updateAudienceGroupRequestSchema,
  type AudienceGroupDetailDto,
  type AudienceListResponse,
  type AudiencePreviewResponse,
  type AudienceRulesApplyResponse,
  type AudienceRulesPreviewResponse,
} from '@ward-comms/validation';
import { parseBody } from '../common/parse-body.util.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { AudiencesService, type AudienceActionContext } from './audiences.service.js';

function buildContext(user: AuthContext['user'], req: Request): AudienceActionContext {
  return { actorUserId: user.id, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

/**
 * Thin controller for the Phase 6 audience groups and communication
 * destinations. Every route is guarded server-side (AGENTS.md #4) — read
 * routes require `audiences.read`, mutating routes require
 * `audiences.manage` (or `destinations.manage` for destination CRUD).
 * All business logic lives in `AudiencesService` / `@ward-comms/domain`.
 */
@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('audiences')
export class AudiencesController {
  constructor(@Inject(AudiencesService) private readonly audiences: AudiencesService) {}

  @RequirePermission('audiences.read')
  @Get()
  async search(@Query() query: unknown, @CurrentUser() user: AuthContext['user']): Promise<AudienceListResponse> {
    const dto = parseBody(audienceSearchQuerySchema, query);
    const results = await this.audiences.search(user.wardId, dto);
    return { audiences: results };
  }

  @RequirePermission('audiences.read')
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthContext['user']): Promise<AudienceGroupDetailDto> {
    return this.audiences.get(user.wardId, id);
  }

  @RequirePermission('audiences.manage')
  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<AudienceGroupDetailDto> {
    const dto = parseBody(createAudienceGroupRequestSchema, body);
    return this.audiences.create(user.wardId, dto, buildContext(user, req));
  }

  @RequirePermission('audiences.manage')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<AudienceGroupDetailDto> {
    const dto = parseBody(updateAudienceGroupRequestSchema, body);
    return this.audiences.update(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('audiences.manage')
  @Post(':id/archive')
  async archive(@Param('id') id: string, @CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<{ ok: true }> {
    await this.audiences.archive(user.wardId, id, buildContext(user, req));
    return { ok: true };
  }

  @RequirePermission('audiences.manage')
  @Post(':id/restore')
  async restore(@Param('id') id: string, @CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<{ ok: true }> {
    await this.audiences.restore(user.wardId, id, buildContext(user, req));
    return { ok: true };
  }

  @RequirePermission('audiences.manage')
  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<{ ok: true }> {
    await this.audiences.delete(user.wardId, id, buildContext(user, req));
    return { ok: true };
  }

  @RequirePermission('audiences.manage')
  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<AudienceGroupDetailDto> {
    const dto = parseBody(addAudienceMemberRequestSchema, body);
    return this.audiences.addMember(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('audiences.manage')
  @Delete(':id/members/:personId')
  async removeMember(
    @Param('id') id: string,
    @Param('personId') personId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<AudienceGroupDetailDto> {
    return this.audiences.removeMember(user.wardId, id, personId, buildContext(user, req));
  }

  @RequirePermission('audiences.manage')
  @Put(':id/rules')
  async setRules(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<AudienceGroupDetailDto> {
    const dto = parseBody(setAudienceRulesRequestSchema, body);
    return this.audiences.setRules(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('audiences.read')
  @Get(':id/rules/preview')
  async previewRules(@Param('id') id: string, @CurrentUser() user: AuthContext['user']): Promise<AudienceRulesPreviewResponse> {
    return this.audiences.previewRules(user.wardId, id);
  }

  @RequirePermission('audiences.manage')
  @Post(':id/rules/apply')
  async applyRules(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<AudienceRulesApplyResponse> {
    return this.audiences.applyRules(user.wardId, id, buildContext(user, req));
  }

  @RequirePermission('audiences.manage')
  @Post(':id/destinations')
  async addDestination(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<AudienceGroupDetailDto> {
    const dto = parseBody(addAudienceDestinationRequestSchema, body);
    return this.audiences.addDestination(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('audiences.manage')
  @Delete(':id/destinations/:destinationId')
  async removeDestination(
    @Param('id') id: string,
    @Param('destinationId') destinationId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<AudienceGroupDetailDto> {
    return this.audiences.removeDestination(user.wardId, id, destinationId, buildContext(user, req));
  }

  @RequirePermission('audiences.read')
  @Post('preview')
  async preview(@Body() body: unknown, @CurrentUser() user: AuthContext['user']): Promise<AudiencePreviewResponse> {
    const dto = parseBody(audiencePreviewRequestSchema, body);
    return this.audiences.preview(user.wardId, dto.audienceGroupIds);
  }
}
