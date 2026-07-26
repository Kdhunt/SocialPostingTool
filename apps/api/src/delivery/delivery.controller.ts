import { Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { DeliveryBatchDetailDto, DeliveryBatchListResponse } from '@ward-comms/validation';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { DeliveryService, type DeliveryActionContext } from './delivery.service.js';

function buildContext(user: AuthContext['user'], req: Request): DeliveryActionContext {
  return { actorUserId: user.id, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('campaigns/:campaignId/delivery-batches')
export class DeliveryController {
  constructor(@Inject(DeliveryService) private readonly delivery: DeliveryService) {}

  @RequirePermission(['campaigns.send', 'campaigns.approve'])
  @Get()
  async list(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: AuthContext['user'],
  ): Promise<DeliveryBatchListResponse> {
    const batches = await this.delivery.listForCampaign(user.wardId, campaignId);
    return { batches };
  }

  @RequirePermission(['campaigns.send', 'campaigns.approve'])
  @Get(':batchId')
  async get(
    @Param('campaignId') campaignId: string,
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthContext['user'],
  ): Promise<DeliveryBatchDetailDto> {
    return this.delivery.getBatch(user.wardId, campaignId, batchId);
  }

  @RequirePermission('campaigns.send')
  @Post()
  async start(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<DeliveryBatchDetailDto> {
    return this.delivery.startDelivery(user.wardId, campaignId, buildContext(user, req));
  }
}
