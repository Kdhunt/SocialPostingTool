import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  createCommunicationDestinationRequestSchema,
  type CommunicationDestinationDto,
  type DestinationListResponse,
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
 * Thin controller for communication destinations (the "what to send
 * to" side of an audience). Real provider credentials are added in
 * Phase 9 — this only manages the non-secret destination record that
 * audiences link to.
 */
@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('communication-destinations')
export class DestinationsController {
  constructor(@Inject(AudiencesService) private readonly audiences: AudiencesService) {}

  @RequirePermission('audiences.read')
  @Get()
  async list(
    @Query('includeArchived') includeArchived: string | undefined,
    @CurrentUser() user: AuthContext['user'],
  ): Promise<DestinationListResponse> {
    const destinations = await this.audiences.listDestinations(user.wardId, includeArchived === 'true');
    return { destinations };
  }

  @RequirePermission('destinations.manage')
  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CommunicationDestinationDto> {
    const dto = parseBody(createCommunicationDestinationRequestSchema, body);
    return this.audiences.createDestination(user.wardId, dto, buildContext(user, req));
  }

  @RequirePermission('destinations.manage')
  @Post(':id/archive')
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.audiences.archiveDestination(user.wardId, id, buildContext(user, req));
    return { ok: true };
  }
}
