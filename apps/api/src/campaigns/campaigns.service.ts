import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Campaign, CampaignApprovalDecision, CampaignStatus, CommunicationChannel } from '@prisma/client';
import {
  checkChannelTextLength,
  findOverlappingPeople,
  isValidCampaignStatusTransition,
  mergeAudienceMemberships,
  resolveEffectiveImageAssetId,
  resolveEffectiveText,
  validateCampaignForSubmission,
} from '@ward-comms/domain';
import type {
  AddCampaignAudienceRequest,
  CampaignDetailDto,
  CampaignPreviewResponse,
  CampaignSummaryDto,
  CampaignValidationResponse,
  CreateCampaignAssetRequest,
  CreateCampaignRequest,
  SetCampaignChannelTextRequest,
  UpdateCampaignAudienceRequest,
  UpdateCampaignRequest,
  UpdateCampaignVersionRequest,
} from '@ward-comms/validation';
import { AuditService } from '../audit/audit.service.js';
import { AudienceGroupRepository } from '../audiences/repositories/audience-group.repository.js';
import { AudienceMemberRepository } from '../audiences/repositories/audience-member.repository.js';
import { CampaignApprovalRepository } from './repositories/campaign-approval.repository.js';
import { CampaignAssetRepository } from './repositories/campaign-asset.repository.js';
import { CampaignAudienceRepository } from './repositories/campaign-audience.repository.js';
import { CampaignChannelVersionRepository } from './repositories/campaign-channel-version.repository.js';
import { CampaignDestinationRepository } from './repositories/campaign-destination.repository.js';
import { CampaignRepository, type CampaignSearchOptions, type CampaignWithCurrentVersionCount } from './repositories/campaign.repository.js';
import { CampaignScheduleRepository } from './repositories/campaign-schedule.repository.js';
import { CampaignVersionRepository, type CampaignVersionWithDetails } from './repositories/campaign-version.repository.js';
import { DeliveryService } from '../delivery/delivery.service.js';

export interface CampaignActionContext {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const ALL_CHANNELS: CommunicationChannel[] = ['Email', 'Sms', 'FacebookPage'];

/**
 * Orchestrates the Phase 7 campaign drafting workflow: one base
 * message/image with independent audience-specific and channel-specific
 * overrides, draft persistence, preview, submission validation, and
 * status transitions. Never calls a real provider — see
 * `CampaignProviderSimulatorService` and phases/07-campaigns.md. Applies
 * the pure domain rules from `@ward-comms/domain` (status transition
 * legality, submission validation, content resolution, cross-audience
 * overlap deduplication) and records an AuditEvent for every mutation.
 */
@Injectable()
export class CampaignsService {
  constructor(
    @Inject(CampaignRepository) private readonly campaigns: CampaignRepository,
    @Inject(CampaignVersionRepository) private readonly versions: CampaignVersionRepository,
    @Inject(CampaignAssetRepository) private readonly assets: CampaignAssetRepository,
    @Inject(CampaignAudienceRepository) private readonly campaignAudiences: CampaignAudienceRepository,
    @Inject(CampaignChannelVersionRepository) private readonly channelVersions: CampaignChannelVersionRepository,
    @Inject(CampaignDestinationRepository) private readonly campaignDestinations: CampaignDestinationRepository,
    @Inject(CampaignApprovalRepository) private readonly approvals: CampaignApprovalRepository,
    @Inject(CampaignScheduleRepository) private readonly schedules: CampaignScheduleRepository,
    @Inject(AudienceGroupRepository) private readonly audienceGroups: AudienceGroupRepository,
    @Inject(AudienceMemberRepository) private readonly audienceMembers: AudienceMemberRepository,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // --- Reads -----------------------------------------------------------------

  async search(wardId: string, options: CampaignSearchOptions): Promise<CampaignSummaryDto[]> {
    const results = await this.campaigns.search(wardId, options);
    return Promise.all(results.map((campaign) => this.toSummary(campaign)));
  }

  async get(wardId: string, id: string): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, id);
    const version = await this.requireCurrentVersion(id);
    const [approvalRows, scheduleRows] = await Promise.all([
      this.approvals.listForCampaign(id),
      this.schedules.listForCampaign(id),
    ]);

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      isActive: campaign.archivedAt === null,
      currentVersion: this.toVersionDto(version),
      approvals: approvalRows.map((approval) => ({
        id: approval.id,
        campaignVersionId: approval.campaignVersionId,
        decision: approval.decision,
        comment: approval.comment,
        approverUserId: approval.approverUserId,
        decidedAt: approval.decidedAt.toISOString(),
      })),
      schedules: scheduleRows.map((schedule) => ({
        id: schedule.id,
        scheduledFor: schedule.scheduledFor.toISOString(),
        cancelledAt: schedule.cancelledAt?.toISOString() ?? null,
        createdAt: schedule.createdAt.toISOString(),
      })),
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    };
  }

  // --- Campaign + version lifecycle -------------------------------------------

  async create(wardId: string, input: CreateCampaignRequest, context: CampaignActionContext): Promise<CampaignDetailDto> {
    const campaign = await this.campaigns.create({ wardId, name: input.name, createdByUserId: context.actorUserId });
    await this.versions.create({
      campaignId: campaign.id,
      versionNumber: 1,
      baseMessage: input.baseMessage ?? null,
      createdByUserId: context.actorUserId,
    });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.created',
      entityType: 'Campaign',
      entityId: campaign.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, campaign.id);
  }

  async updateName(wardId: string, id: string, input: UpdateCampaignRequest, context: CampaignActionContext): Promise<CampaignDetailDto> {
    await this.assertCampaignInWard(wardId, id);
    if (input.name) {
      await this.campaigns.updateName(id, input.name);
    }
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.updated',
      entityType: 'Campaign',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return this.get(wardId, id);
  }

  async archive(wardId: string, id: string, context: CampaignActionContext): Promise<void> {
    const campaign = await this.assertCampaignInWard(wardId, id);
    if (campaign.status === 'Sending') {
      throw new BadRequestException('This campaign is actively sending and cannot be archived right now.');
    }
    await this.campaigns.archive(id);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.archived',
      entityType: 'Campaign',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async updateVersionContent(
    wardId: string,
    campaignId: string,
    input: UpdateCampaignVersionRequest,
    context: CampaignActionContext,
  ): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertEditable(campaign.status);
    const version = await this.requireCurrentVersion(campaignId);

    if (input.baseImageAssetId) {
      await this.assertAssetInCampaign(campaignId, input.baseImageAssetId);
    }

    await this.versions.updateContent(version.id, input);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.version.content_updated',
      entityType: 'CampaignVersion',
      entityId: version.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return this.get(wardId, campaignId);
  }

  async createAsset(
    wardId: string,
    campaignId: string,
    input: CreateCampaignAssetRequest,
    context: CampaignActionContext,
  ): Promise<{ id: string }> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertEditable(campaign.status);

    const asset = await this.assets.create({
      campaignId,
      storageReference: input.storageReference,
      contentType: input.contentType,
      altText: input.altText,
    });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.asset.created',
      entityType: 'CampaignAsset',
      entityId: asset.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { id: asset.id };
  }

  // --- Audiences ---------------------------------------------------------------

  async addAudience(
    wardId: string,
    campaignId: string,
    input: AddCampaignAudienceRequest,
    context: CampaignActionContext,
  ): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertEditable(campaign.status);
    const version = await this.requireCurrentVersion(campaignId);

    const audienceGroup = await this.audienceGroups.findByIdForWard(wardId, input.audienceGroupId);
    if (!audienceGroup) {
      throw new NotFoundException('Audience group not found.');
    }
    if (audienceGroup.archivedAt !== null) {
      throw new BadRequestException('This audience has been archived and cannot be added to a campaign.');
    }
    if (input.overrideImageAssetId) {
      await this.assertAssetInCampaign(campaignId, input.overrideImageAssetId);
    }

    const existing = version.audiences.some((a) => a.audienceGroupId === input.audienceGroupId);
    if (existing) {
      throw new BadRequestException('This audience is already selected for this campaign.');
    }

    await this.campaignAudiences.add({
      campaignVersionId: version.id,
      audienceGroupId: input.audienceGroupId,
      overrideText: input.overrideText,
      overrideImageAssetId: input.overrideImageAssetId,
    });

    await this.recomputeDestinations(wardId, version.id, [...version.audiences.map((a) => a.audienceGroupId), input.audienceGroupId]);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.audience.added',
      entityType: 'CampaignVersion',
      entityId: version.id,
      metadata: { audienceGroupId: input.audienceGroupId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, campaignId);
  }

  async updateAudienceOverride(
    wardId: string,
    campaignId: string,
    audienceGroupId: string,
    input: UpdateCampaignAudienceRequest,
    context: CampaignActionContext,
  ): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertEditable(campaign.status);
    const version = await this.requireCurrentVersion(campaignId);

    if (input.overrideImageAssetId) {
      await this.assertAssetInCampaign(campaignId, input.overrideImageAssetId);
    }

    await this.campaignAudiences.update(version.id, audienceGroupId, input);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.audience.override_updated',
      entityType: 'CampaignVersion',
      entityId: version.id,
      metadata: { audienceGroupId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, campaignId);
  }

  async removeAudience(wardId: string, campaignId: string, audienceGroupId: string, context: CampaignActionContext): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertEditable(campaign.status);
    const version = await this.requireCurrentVersion(campaignId);

    await this.campaignAudiences.remove(version.id, audienceGroupId);
    const remaining = version.audiences.map((a) => a.audienceGroupId).filter((id) => id !== audienceGroupId);
    await this.recomputeDestinations(wardId, version.id, remaining);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.audience.removed',
      entityType: 'CampaignVersion',
      entityId: version.id,
      metadata: { audienceGroupId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, campaignId);
  }

  // --- Channel text --------------------------------------------------------------

  async setChannelText(
    wardId: string,
    campaignId: string,
    input: SetCampaignChannelTextRequest,
    context: CampaignActionContext,
  ): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertEditable(campaign.status);
    const version = await this.requireCurrentVersion(campaignId);

    const lengthCheck = checkChannelTextLength(input.channel, input.text);
    if (!lengthCheck.valid) {
      throw new BadRequestException(
        `Text for ${input.channel} exceeds the maximum length of ${String(lengthCheck.maxLength)} characters (got ${String(lengthCheck.length)}).`,
      );
    }

    await this.channelVersions.upsert(version.id, input.channel, input.text);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.channel_text.set',
      entityType: 'CampaignVersion',
      entityId: version.id,
      metadata: { channel: input.channel },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, campaignId);
  }

  async removeChannelText(wardId: string, campaignId: string, channel: CommunicationChannel, context: CampaignActionContext): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertEditable(campaign.status);
    const version = await this.requireCurrentVersion(campaignId);

    await this.channelVersions.remove(version.id, channel);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.channel_text.removed',
      entityType: 'CampaignVersion',
      entityId: version.id,
      metadata: { channel },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, campaignId);
  }

  // --- Preview & validation --------------------------------------------------------

  async preview(wardId: string, campaignId: string): Promise<CampaignPreviewResponse> {
    await this.assertCampaignInWard(wardId, campaignId);
    const version = await this.requireCurrentVersion(campaignId);

    const membershipSets = await Promise.all(
      version.audiences.map(async (audience) => ({
        audienceGroupId: audience.audienceGroupId,
        personIds: await this.audienceMembers.listPersonIds(audience.audienceGroupId),
      })),
    );
    const merged = mergeAudienceMemberships(membershipSets);
    const overlapping = findOverlappingPeople(membershipSets);

    const audiences = version.audiences.map((audience) => {
      const personIds = membershipSets.find((s) => s.audienceGroupId === audience.audienceGroupId)?.personIds ?? [];
      const resolvedImageAssetId = resolveEffectiveImageAssetId({
        baseImageAssetId: version.baseImageAssetId,
        audienceOverrideImageAssetId: audience.overrideImageAssetId,
      });

      const channels = ALL_CHANNELS.map((channel) => {
        const channelText = version.channelVersions.find((c) => c.channel === channel)?.text ?? null;
        const text = resolveEffectiveText({
          baseMessage: version.baseMessage,
          channelText,
          audienceOverrideText: audience.overrideText,
        });
        const lengthCheck = checkChannelTextLength(channel, text ?? '');
        return { channel, text, length: lengthCheck.length, exceedsLimit: !lengthCheck.valid };
      });

      return {
        audienceGroupId: audience.audienceGroupId,
        audienceGroupName: audience.audienceGroup.name,
        recipientCount: personIds.length,
        resolvedImageAssetId,
        channels,
      };
    });

    return {
      versionNumber: version.versionNumber,
      totalUniqueRecipients: merged.length,
      overlapCount: overlapping.length,
      audiences,
    };
  }

  async validateForSubmission(wardId: string, campaignId: string): Promise<CampaignValidationResponse> {
    await this.assertCampaignInWard(wardId, campaignId);
    const version = await this.requireCurrentVersion(campaignId);
    return validateCampaignForSubmission(await this.buildSubmissionCheckInput(version));
  }

  // --- Status transitions --------------------------------------------------------

  async submitForApproval(wardId: string, campaignId: string, context: CampaignActionContext): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertTransition(campaign.status, 'PendingApproval');
    const version = await this.requireCurrentVersion(campaignId);

    const check = validateCampaignForSubmission(await this.buildSubmissionCheckInput(version));
    if (!check.valid) {
      throw new BadRequestException(check.errors.join(' '));
    }

    await this.transitionStatus(wardId, campaignId, campaign.status, 'PendingApproval', context);
    return this.get(wardId, campaignId);
  }

  async decideApproval(
    wardId: string,
    campaignId: string,
    decision: CampaignApprovalDecision,
    comment: string | undefined,
    context: CampaignActionContext,
  ): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertTransition(campaign.status, decision);
    const version = await this.requireCurrentVersion(campaignId);

    await this.approvals.create({
      campaignId,
      campaignVersionId: version.id,
      approverUserId: context.actorUserId,
      decision,
      comment,
    });

    await this.transitionStatus(wardId, campaignId, campaign.status, decision, context, { comment });
    return this.get(wardId, campaignId);
  }

  /** Reopens a Rejected campaign for editing by creating a new, independent version. */
  async revise(wardId: string, campaignId: string, context: CampaignActionContext): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertTransition(campaign.status, 'Draft');
    const previous = await this.requireCurrentVersion(campaignId);

    await this.versions.create({
      campaignId,
      versionNumber: previous.versionNumber + 1,
      baseMessage: previous.baseMessage,
      baseImageAssetId: previous.baseImageAssetId,
      createdByUserId: context.actorUserId,
    });

    await this.transitionStatus(wardId, campaignId, campaign.status, 'Draft', context);
    return this.get(wardId, campaignId);
  }

  async schedule(wardId: string, campaignId: string, scheduledFor: Date, context: CampaignActionContext): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertTransition(campaign.status, 'Scheduled');

    if (scheduledFor.getTime() <= Date.now()) {
      throw new BadRequestException('The scheduled time must be in the future.');
    }

    await this.schedules.create({ campaignId, scheduledFor, createdByUserId: context.actorUserId });
    await this.transitionStatus(wardId, campaignId, campaign.status, 'Scheduled', context, {
      scheduledFor: scheduledFor.toISOString(),
    });
    return this.get(wardId, campaignId);
  }

  /**
   * Starts the Phase 8 delivery engine for this campaign's current version
   * (queued, idempotent, per-recipient). Provider adapters are simulated
   * in this phase — see apps/worker and docs/delivery.md.
   */
  async sendNow(wardId: string, campaignId: string, context: CampaignActionContext): Promise<CampaignDetailDto> {
    await this.assertCampaignInWard(wardId, campaignId);
    await this.delivery.startDelivery(wardId, campaignId, context);
    return this.get(wardId, campaignId);
  }

  async cancel(wardId: string, campaignId: string, context: CampaignActionContext): Promise<CampaignDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    this.assertTransition(campaign.status, 'Cancelled');
    await this.transitionStatus(wardId, campaignId, campaign.status, 'Cancelled', context);
    return this.get(wardId, campaignId);
  }

  // --- Internal helpers -----------------------------------------------------------

  private async assertCampaignInWard(wardId: string, id: string): Promise<Campaign> {
    const campaign = await this.campaigns.findByIdForWard(wardId, id);
    if (!campaign) {
      throw new NotFoundException('Campaign not found.');
    }
    return campaign;
  }

  private async requireCurrentVersion(campaignId: string): Promise<CampaignVersionWithDetails> {
    const version = await this.versions.findCurrentForCampaign(campaignId);
    if (!version) {
      throw new NotFoundException('Campaign version not found.');
    }
    return version;
  }

  private assertEditable(status: CampaignStatus): void {
    if (status !== 'Draft') {
      throw new BadRequestException(`This campaign cannot be edited while it is ${status}.`);
    }
  }

  private assertTransition(from: CampaignStatus, to: CampaignStatus): void {
    if (!isValidCampaignStatusTransition(from, to)) {
      throw new BadRequestException(`Cannot move a campaign from ${from} to ${to}.`);
    }
  }

  private async transitionStatus(
    wardId: string,
    campaignId: string,
    from: CampaignStatus,
    to: CampaignStatus,
    context: CampaignActionContext,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.campaigns.updateStatus(campaignId, to);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'campaign.status_changed',
      entityType: 'Campaign',
      entityId: campaignId,
      metadata: { from, to, ...metadata },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private async assertAssetInCampaign(campaignId: string, assetId: string): Promise<void> {
    const asset = await this.assets.findByIdForCampaign(campaignId, assetId);
    if (!asset) {
      throw new NotFoundException('Campaign asset not found.');
    }
  }

  /** Recomputes the deduplicated, active-only destination set for a version from its (about-to-be) selected audiences. */
  private async recomputeDestinations(wardId: string, campaignVersionId: string, audienceGroupIds: string[]): Promise<void> {
    const groups = await Promise.all(
      audienceGroupIds.map((id) => this.audienceGroups.findByIdForWard(wardId, id)),
    );
    const activeDestinationIds = new Set<string>();
    for (const group of groups) {
      if (!group) continue;
      for (const link of group.destinations) {
        if (link.destination.archivedAt === null) {
          activeDestinationIds.add(link.destination.id);
        }
      }
    }
    await this.campaignDestinations.replaceForVersion(campaignVersionId, [...activeDestinationIds]);
  }

  private async buildSubmissionCheckInput(version: CampaignVersionWithDetails): Promise<{
    hasContent: boolean;
    audienceCount: number;
    activeDestinationCount: number;
    hasArchivedDestination: boolean;
  }> {
    const hasBaseMessage = Boolean(version.baseMessage && version.baseMessage.trim().length > 0);
    const everyAudienceHasOverride =
      version.audiences.length > 0 && version.audiences.every((a) => Boolean(a.overrideText && a.overrideText.trim().length > 0));

    // `CampaignDestination` rows are recomputed (active-only) whenever the
    // audience selection changes, but a linked destination can still be
    // archived afterward without the campaign being touched — checking the
    // stored rows here catches that case at submission time.
    const hasArchivedDestination = version.destinations.some((d) => d.destination.archivedAt !== null);

    return {
      hasContent: hasBaseMessage || everyAudienceHasOverride,
      audienceCount: version.audiences.length,
      activeDestinationCount: version.destinations.filter((d) => d.destination.archivedAt === null).length,
      hasArchivedDestination,
    };
  }

  private async toSummary(campaign: CampaignWithCurrentVersionCount): Promise<CampaignSummaryDto> {
    const version = await this.versions.findCurrentForCampaign(campaign.id);
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      isActive: campaign.archivedAt === null,
      currentVersionNumber: version?.versionNumber ?? 0,
      audienceCount: version?.audiences.length ?? 0,
      updatedAt: campaign.updatedAt.toISOString(),
    };
  }

  private toVersionDto(version: CampaignVersionWithDetails): CampaignDetailDto['currentVersion'] {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      baseMessage: version.baseMessage,
      baseImageAssetId: version.baseImageAssetId,
      channelVersions: version.channelVersions.map((c) => ({ channel: c.channel as CommunicationChannel, text: c.text })),
      audiences: version.audiences.map((a) => ({
        audienceGroupId: a.audienceGroupId,
        audienceGroupName: a.audienceGroup.name,
        overrideText: a.overrideText,
        overrideImageAssetId: a.overrideImageAssetId,
      })),
      destinations: version.destinations.map((d) => ({
        destinationId: d.destinationId,
        name: d.destination.name,
        channel: d.destination.channel as CommunicationChannel,
        isActive: d.destination.archivedAt === null,
      })),
      createdAt: version.createdAt.toISOString(),
    };
  }
}
