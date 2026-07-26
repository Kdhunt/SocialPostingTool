import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  addCampaignAudienceRequestSchema,
  campaignSearchQuerySchema,
  createCampaignAssetRequestSchema,
  createCampaignRequestSchema,
  decideCampaignApprovalRequestSchema,
  scheduleCampaignRequestSchema,
  setCampaignChannelTextRequestSchema,
  updateCampaignAudienceRequestSchema,
  updateCampaignRequestSchema,
  updateCampaignVersionRequestSchema,
  type CampaignDetailDto,
  type CampaignListResponse,
  type CampaignPreviewResponse,
  type CampaignValidationResponse,
} from '@ward-comms/validation';
import type { CommunicationChannel } from '@prisma/client';
import { parseBody } from '../common/parse-body.util.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { CampaignsService, type CampaignActionContext } from './campaigns.service.js';

function buildContext(user: AuthContext['user'], req: Request): CampaignActionContext {
  return { actorUserId: user.id, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

/**
 * Thin controller for the Phase 7 campaign drafting workflow. Read routes
 * require `campaigns.create` or `campaigns.approve` (both may view);
 * mutating drafting routes require `campaigns.create`; approve/reject
 * require `campaigns.approve`; send/schedule require `campaigns.send`. No
 * route in this controller ever calls a real provider — see
 * `CampaignProviderSimulatorService`.
 */
@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(@Inject(CampaignsService) private readonly campaigns: CampaignsService) {}

  @RequirePermission(['campaigns.create', 'campaigns.approve'])
  @Get()
  async search(@Query() query: unknown, @CurrentUser() user: AuthContext['user']): Promise<CampaignListResponse> {
    const dto = parseBody(campaignSearchQuerySchema, query);
    const campaigns = await this.campaigns.search(user.wardId, dto);
    return { campaigns };
  }

  @RequirePermission(['campaigns.create', 'campaigns.approve'])
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthContext['user']): Promise<CampaignDetailDto> {
    return this.campaigns.get(user.wardId, id);
  }

  @RequirePermission(['campaigns.create', 'campaigns.approve'])
  @Get(':id/preview')
  async preview(@Param('id') id: string, @CurrentUser() user: AuthContext['user']): Promise<CampaignPreviewResponse> {
    return this.campaigns.preview(user.wardId, id);
  }

  @RequirePermission(['campaigns.create', 'campaigns.approve'])
  @Get(':id/validation')
  async validate(@Param('id') id: string, @CurrentUser() user: AuthContext['user']): Promise<CampaignValidationResponse> {
    return this.campaigns.validateForSubmission(user.wardId, id);
  }

  @RequirePermission('campaigns.create')
  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<CampaignDetailDto> {
    const dto = parseBody(createCampaignRequestSchema, body);
    return this.campaigns.create(user.wardId, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Patch(':id')
  async updateName(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    const dto = parseBody(updateCampaignRequestSchema, body);
    return this.campaigns.updateName(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Post(':id/archive')
  async archive(@Param('id') id: string, @CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<{ ok: true }> {
    await this.campaigns.archive(user.wardId, id, buildContext(user, req));
    return { ok: true };
  }

  @RequirePermission('campaigns.create')
  @Patch(':id/content')
  async updateContent(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    const dto = parseBody(updateCampaignVersionRequestSchema, body);
    return this.campaigns.updateVersionContent(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Post(':id/assets')
  async createAsset(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<{ id: string }> {
    const dto = parseBody(createCampaignAssetRequestSchema, body);
    return this.campaigns.createAsset(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Post(':id/audiences')
  async addAudience(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    const dto = parseBody(addCampaignAudienceRequestSchema, body);
    return this.campaigns.addAudience(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Patch(':id/audiences/:audienceGroupId')
  async updateAudience(
    @Param('id') id: string,
    @Param('audienceGroupId') audienceGroupId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    const dto = parseBody(updateCampaignAudienceRequestSchema, body);
    return this.campaigns.updateAudienceOverride(user.wardId, id, audienceGroupId, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Delete(':id/audiences/:audienceGroupId')
  async removeAudience(
    @Param('id') id: string,
    @Param('audienceGroupId') audienceGroupId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    return this.campaigns.removeAudience(user.wardId, id, audienceGroupId, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Post(':id/channel-text')
  async setChannelText(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    const dto = parseBody(setCampaignChannelTextRequestSchema, body);
    return this.campaigns.setChannelText(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Delete(':id/channel-text/:channel')
  async removeChannelText(
    @Param('id') id: string,
    @Param('channel') channel: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    return this.campaigns.removeChannelText(user.wardId, id, channel as CommunicationChannel, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Post(':id/submit')
  async submit(@Param('id') id: string, @CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<CampaignDetailDto> {
    return this.campaigns.submitForApproval(user.wardId, id, buildContext(user, req));
  }

  @RequirePermission('campaigns.approve')
  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    const dto = parseBody(decideCampaignApprovalRequestSchema, body);
    return this.campaigns.decideApproval(user.wardId, id, 'Approved', dto.comment, buildContext(user, req));
  }

  @RequirePermission('campaigns.approve')
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    const dto = parseBody(decideCampaignApprovalRequestSchema, body);
    return this.campaigns.decideApproval(user.wardId, id, 'Rejected', dto.comment, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Post(':id/revise')
  async revise(@Param('id') id: string, @CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<CampaignDetailDto> {
    return this.campaigns.revise(user.wardId, id, buildContext(user, req));
  }

  @RequirePermission('campaigns.send')
  @Post(':id/schedule')
  async schedule(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<CampaignDetailDto> {
    const dto = parseBody(scheduleCampaignRequestSchema, body);
    return this.campaigns.schedule(user.wardId, id, new Date(dto.scheduledFor), buildContext(user, req));
  }

  @RequirePermission('campaigns.send')
  @Post(':id/send-now')
  async sendNow(@Param('id') id: string, @CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<CampaignDetailDto> {
    return this.campaigns.sendNow(user.wardId, id, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<CampaignDetailDto> {
    return this.campaigns.cancel(user.wardId, id, buildContext(user, req));
  }
}
