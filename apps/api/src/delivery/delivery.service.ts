import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Campaign, CommunicationChannel } from '@prisma/client';
import {
  computeBatchIdempotencyKey,
  computeSkippedRecipientIdempotencyKey,
  expandDeliveryRecipients,
  isValidCampaignStatusTransition,
  resolveEffectiveImageAssetId,
  resolveEffectiveText,
  type AudienceMembershipSet,
  type ExpansionContactMethod,
  type ExpansionDestination,
} from '@ward-comms/domain';
import type { DeliveryBatchDetailDto, DeliveryBatchSummaryDto } from '@ward-comms/validation';
import { AuditService } from '../audit/audit.service.js';
import { AudienceMemberRepository } from '../audiences/repositories/audience-member.repository.js';
import { CampaignRepository } from '../campaigns/repositories/campaign.repository.js';
import {
  CampaignVersionRepository,
  type CampaignVersionWithDetails,
} from '../campaigns/repositories/campaign-version.repository.js';
import { ContactMethodRepository } from '../directory/repositories/contact-method.repository.js';
import { DeliveryQueueService } from './delivery-queue.service.js';
import { DeliveryBatchRepository } from './repositories/delivery-batch.repository.js';
import {
  DeliveryRecipientRepository,
  type CreateDeliveryRecipientInput,
} from './repositories/delivery-recipient.repository.js';

export interface DeliveryActionContext {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Orchestrates Phase 8 delivery: expand recipients (overlap + consent),
 * persist idempotently, enqueue BullMQ jobs. Provider calls live in the worker.
 */
@Injectable()
export class DeliveryService {
  constructor(
    @Inject(CampaignRepository) private readonly campaigns: CampaignRepository,
    @Inject(CampaignVersionRepository) private readonly versions: CampaignVersionRepository,
    @Inject(AudienceMemberRepository) private readonly audienceMembers: AudienceMemberRepository,
    @Inject(ContactMethodRepository) private readonly contactMethods: ContactMethodRepository,
    @Inject(DeliveryBatchRepository) private readonly batches: DeliveryBatchRepository,
    @Inject(DeliveryRecipientRepository) private readonly recipients: DeliveryRecipientRepository,
    @Inject(DeliveryQueueService) private readonly queue: DeliveryQueueService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listForCampaign(wardId: string, campaignId: string): Promise<DeliveryBatchSummaryDto[]> {
    await this.assertCampaignInWard(wardId, campaignId);
    const batches = await this.batches.listForCampaign(campaignId);
    return batches.map((batch) => this.toSummary(batch));
  }

  async getBatch(wardId: string, campaignId: string, batchId: string): Promise<DeliveryBatchDetailDto> {
    await this.assertCampaignInWard(wardId, campaignId);
    const batch = await this.batches.findByIdForWard(wardId, batchId);
    if (!batch || batch.campaignId !== campaignId) {
      throw new NotFoundException('Delivery batch not found.');
    }
    const recipientRows = await this.recipients.listForBatch(batch.id);
    return {
      ...this.toSummary(batch),
      recipients: recipientRows.map((recipient) => ({
        id: recipient.id,
        personId: recipient.personId,
        channel: recipient.channel as CommunicationChannel,
        destinationId: recipient.destinationId,
        status: recipient.status,
        skipReason: recipient.skipReason,
        attemptCount: recipient.attemptCount,
        attempts: recipient.attempts.map((attempt) => ({
          id: attempt.id,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          providerMessageId: attempt.providerMessageId,
          errorCode: attempt.errorCode,
          errorMessage: attempt.errorMessage,
          attemptedAt: attempt.attemptedAt.toISOString(),
        })),
      })),
    };
  }

  async startDelivery(
    wardId: string,
    campaignId: string,
    context: DeliveryActionContext,
  ): Promise<DeliveryBatchDetailDto> {
    const campaign = await this.assertCampaignInWard(wardId, campaignId);
    const version = await this.requireCurrentVersion(campaignId);

    if (campaign.status !== 'Approved' && campaign.status !== 'Sending') {
      if (!isValidCampaignStatusTransition(campaign.status, 'Sending')) {
        throw new BadRequestException(`Cannot start delivery for a campaign in status ${campaign.status}.`);
      }
    }

    const idempotencyKey = computeBatchIdempotencyKey(campaignId, version.id);
    const { batch, wasCreated } = await this.batches.findOrCreate({
      wardId,
      campaignId,
      campaignVersionId: version.id,
      idempotencyKey,
      createdByUserId: context.actorUserId,
    });

    if (wasCreated) {
      if (campaign.status === 'Approved') {
        await this.campaigns.updateStatus(campaignId, 'Sending');
        await this.audit.record({
          wardId,
          actorUserId: context.actorUserId,
          action: 'campaign.status_changed',
          entityType: 'Campaign',
          entityId: campaignId,
          metadata: { from: 'Approved', to: 'Sending' },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }

      await this.expandAndPersistRecipients(batch.id, version);
      await this.batches.recomputeCounts(batch.id);

      const allRecipients = await this.recipients.listForBatch(batch.id);
      const pending = allRecipients.filter((r) => r.status === 'Pending');
      await Promise.all(pending.map((r) => this.queue.enqueue(r.id)));

      if (pending.length === 0) {
        // Expansion produced only Skipped rows (or nothing) — no worker jobs
        // will run, so finalize the batch and campaign here.
        await this.batches.setStatus(batch.id, 'Completed', new Date());
        await this.campaigns.updateStatus(campaignId, 'Sent');
        await this.audit.record({
          wardId,
          actorUserId: context.actorUserId,
          action: 'campaign.status_changed',
          entityType: 'Campaign',
          entityId: campaignId,
          metadata: { from: 'Sending', to: 'Sent', reason: 'no_pending_recipients' },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }

      await this.audit.record({
        wardId,
        actorUserId: context.actorUserId,
        action: 'delivery.batch.started',
        entityType: 'DeliveryBatch',
        entityId: batch.id,
        metadata: { campaignId, campaignVersionId: version.id, pendingCount: pending.length },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    return this.getBatch(wardId, campaignId, batch.id);
  }

  private async expandAndPersistRecipients(
    deliveryBatchId: string,
    version: CampaignVersionWithDetails,
  ): Promise<void> {
    const membershipSets: AudienceMembershipSet[] = await Promise.all(
      version.audiences.map(async (audience) => ({
        audienceGroupId: audience.audienceGroupId,
        personIds: await this.audienceMembers.listPersonIds(audience.audienceGroupId),
      })),
    );

    const allPersonIds = [...new Set(membershipSets.flatMap((set) => set.personIds))];
    const contactMethodRows = await this.contactMethods.listForPersons(allPersonIds);
    const expansionContactMethods: ExpansionContactMethod[] = contactMethodRows.map((method) => ({
      contactMethodId: method.id,
      personId: method.personId,
      type: method.type,
      consentStatus: method.consent?.status ?? 'Unknown',
      archivedAt: method.archivedAt,
    }));

    const expansionDestinations: ExpansionDestination[] = version.destinations
      .filter((link) => link.destination.archivedAt === null)
      .map((link) => ({
        destinationId: link.destinationId,
        channel: link.destination.channel as CommunicationChannel,
      }));

    const { recipients: expanded, skipped } = expandDeliveryRecipients({
      audienceMemberships: membershipSets,
      destinations: expansionDestinations,
      contactMethods: expansionContactMethods,
    });

    const audienceById = new Map(version.audiences.map((a) => [a.audienceGroupId, a]));
    const channelTextByChannel = new Map(version.channelVersions.map((c) => [c.channel, c.text]));

    const recipientRows: CreateDeliveryRecipientInput[] = expanded.map((recipient) => {
      if (recipient.kind === 'person') {
        const primaryAudienceGroupId = recipient.sourceAudienceGroupIds[0] ?? null;
        const override = primaryAudienceGroupId ? audienceById.get(primaryAudienceGroupId) : undefined;
        return {
          id: randomUUID(),
          deliveryBatchId,
          personId: recipient.personId,
          channel: recipient.channel,
          destinationId: recipient.destinationId,
          contactMethodId: recipient.contactMethodId,
          sourceAudienceGroupId: primaryAudienceGroupId,
          idempotencyKey: recipient.idempotencyKey,
          status: 'Pending',
          skipReason: null,
          resolvedText: resolveEffectiveText({
            baseMessage: version.baseMessage,
            channelText: channelTextByChannel.get(recipient.channel) ?? null,
            audienceOverrideText: override?.overrideText ?? null,
          }),
          resolvedImageAssetId: resolveEffectiveImageAssetId({
            baseImageAssetId: version.baseImageAssetId,
            audienceOverrideImageAssetId: override?.overrideImageAssetId ?? null,
          }),
        };
      }
      return {
        id: randomUUID(),
        deliveryBatchId,
        personId: null,
        channel: 'FacebookPage',
        destinationId: recipient.destinationId,
        contactMethodId: null,
        sourceAudienceGroupId: null,
        idempotencyKey: recipient.idempotencyKey,
        status: 'Pending',
        skipReason: null,
        resolvedText: resolveEffectiveText({
          baseMessage: version.baseMessage,
          channelText: channelTextByChannel.get('FacebookPage') ?? null,
          audienceOverrideText: null,
        }),
        resolvedImageAssetId: resolveEffectiveImageAssetId({
          baseImageAssetId: version.baseImageAssetId,
          audienceOverrideImageAssetId: null,
        }),
      };
    });

    const skippedRows: CreateDeliveryRecipientInput[] = skipped.map((skip) => ({
      id: randomUUID(),
      deliveryBatchId,
      personId: skip.personId,
      channel: skip.channel,
      destinationId: null,
      contactMethodId: null,
      sourceAudienceGroupId: skip.sourceAudienceGroupIds[0] ?? null,
      idempotencyKey: computeSkippedRecipientIdempotencyKey({
        channel: skip.channel,
        personId: skip.personId,
      }),
      status: 'Skipped',
      skipReason: skip.reason,
    }));

    await this.recipients.createMany([...recipientRows, ...skippedRows]);
  }

  private async assertCampaignInWard(wardId: string, campaignId: string): Promise<Campaign> {
    const campaign = await this.campaigns.findByIdForWard(wardId, campaignId);
    if (!campaign) throw new NotFoundException('Campaign not found.');
    return campaign;
  }

  private async requireCurrentVersion(campaignId: string): Promise<CampaignVersionWithDetails> {
    const version = await this.versions.findCurrentForCampaign(campaignId);
    if (!version) throw new NotFoundException('Campaign version not found.');
    return version;
  }

  private toSummary(batch: {
    id: string;
    campaignId: string;
    campaignVersionId: string;
    status: string;
    totalRecipients: number;
    sentCount: number;
    deadLetteredCount: number;
    skippedCount: number;
    createdAt: Date;
    completedAt: Date | null;
  }): DeliveryBatchSummaryDto {
    return {
      id: batch.id,
      campaignId: batch.campaignId,
      campaignVersionId: batch.campaignVersionId,
      status: batch.status as DeliveryBatchSummaryDto['status'],
      totalRecipients: batch.totalRecipients,
      sentCount: batch.sentCount,
      deadLetteredCount: batch.deadLetteredCount,
      skippedCount: batch.skippedCount,
      createdAt: batch.createdAt.toISOString(),
      completedAt: batch.completedAt?.toISOString() ?? null,
    };
  }
}
