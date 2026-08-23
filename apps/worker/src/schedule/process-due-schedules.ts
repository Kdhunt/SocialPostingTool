import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@ward-comms/database';
import type { CommunicationChannel } from '@ward-comms/domain';
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
import type { Queue } from 'bullmq';
import type { DeliveryJobData, DeliveryJobResult } from '@ward-comms/domain';
import { logger } from '../logger.js';

export interface SchedulePollerDeps {
  prisma: PrismaClient;
  deliveryQueue: Queue<DeliveryJobData, DeliveryJobResult>;
}

/**
 * Finds CampaignSchedule rows that are due and starts delivery for each
 * associated campaign. Idempotent — reuses an existing DeliveryBatch when
 * send was already started for the current campaign version.
 */
export async function processDueSchedules(deps: SchedulePollerDeps): Promise<number> {
  const now = new Date();
  const dueSchedules = await deps.prisma.campaignSchedule.findMany({
    where: {
      scheduledFor: { lte: now },
      cancelledAt: null,
      campaign: { status: 'Scheduled', archivedAt: null },
    },
    include: {
      campaign: { select: { id: true, wardId: true, status: true } },
      createdBy: { select: { id: true } },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 20,
  });

  let started = 0;
  for (const schedule of dueSchedules) {
    try {
      const didStart = await startScheduledCampaignDelivery(deps, {
        wardId: schedule.campaign.wardId,
        campaignId: schedule.campaign.id,
        actorUserId: schedule.createdByUserId ?? schedule.createdBy?.id ?? null,
      });
      if (didStart) started += 1;
    } catch (error) {
      logger.error(
        { scheduleId: schedule.id, campaignId: schedule.campaignId, error },
        'Failed to process due campaign schedule',
      );
    }
  }
  return started;
}

async function startScheduledCampaignDelivery(
  deps: SchedulePollerDeps,
  input: { wardId: string; campaignId: string; actorUserId: string | null },
): Promise<boolean> {
  const campaign = await deps.prisma.campaign.findFirst({
    where: { id: input.campaignId, wardId: input.wardId, archivedAt: null },
  });
  if (!campaign || campaign.status !== 'Scheduled') return false;

  const version = await deps.prisma.campaignVersion.findFirst({
    where: { campaignId: input.campaignId },
    orderBy: { versionNumber: 'desc' },
    include: {
      channelVersions: { select: { channel: true, text: true } },
      audiences: true,
      destinations: {
        select: {
          destinationId: true,
          destination: { select: { id: true, channel: true, archivedAt: true } },
        },
      },
    },
  });
  if (!version) return false;

  const idempotencyKey = computeBatchIdempotencyKey(input.campaignId, version.id);
  const existing = await deps.prisma.deliveryBatch.findUnique({
    where: { wardId_idempotencyKey: { wardId: input.wardId, idempotencyKey } },
  });
  if (existing) return false;

  const actorUserId = input.actorUserId ?? campaign.createdByUserId;
  if (!actorUserId) {
    logger.warn({ campaignId: input.campaignId }, 'Skipping scheduled send — no actor user id');
    return false;
  }

  let batch;
  try {
    batch = await deps.prisma.deliveryBatch.create({
      data: {
        wardId: input.wardId,
        campaignId: input.campaignId,
        campaignVersionId: version.id,
        idempotencyKey,
        createdByUserId: actorUserId,
      },
    });
  } catch {
    return false;
  }

  if (isValidCampaignStatusTransition(campaign.status, 'Sending')) {
    await deps.prisma.campaign.update({ where: { id: input.campaignId }, data: { status: 'Sending' } });
    await deps.prisma.auditEvent.create({
      data: {
        wardId: input.wardId,
        actorUserId,
        action: 'campaign.status_changed',
        entityType: 'Campaign',
        entityId: input.campaignId,
        metadata: { from: 'Scheduled', to: 'Sending', trigger: 'schedule_poller' },
      },
    });
  }

  await expandAndPersistRecipients(deps.prisma, batch.id, version);
  await recomputeBatchCounts(deps.prisma, batch.id);

  const pending = await deps.prisma.deliveryRecipient.findMany({
    where: { deliveryBatchId: batch.id, status: 'Pending' },
    select: { id: true },
  });
  await Promise.all(
    pending.map((recipient) =>
      deps.deliveryQueue.add('deliver', { deliveryRecipientId: recipient.id }, { jobId: recipient.id }),
    ),
  );

  if (pending.length === 0) {
    await deps.prisma.deliveryBatch.update({
      where: { id: batch.id },
      data: { status: 'Completed', completedAt: new Date() },
    });
    await deps.prisma.campaign.update({ where: { id: input.campaignId }, data: { status: 'Sent' } });
  }

  await deps.prisma.auditEvent.create({
    data: {
      wardId: input.wardId,
      actorUserId,
      action: 'delivery.batch.started',
      entityType: 'DeliveryBatch',
      entityId: batch.id,
      metadata: {
        campaignId: input.campaignId,
        campaignVersionId: version.id,
        pendingCount: pending.length,
        trigger: 'schedule_poller',
      },
    },
  });

  return true;
}

async function expandAndPersistRecipients(
  prisma: PrismaClient,
  deliveryBatchId: string,
  version: {
    baseMessage: string | null;
    baseImageAssetId: string | null;
    channelVersions: { channel: string; text: string }[];
    audiences: {
      audienceGroupId: string;
      overrideText: string | null;
      overrideImageAssetId: string | null;
    }[];
    destinations: {
      destinationId: string;
      destination: { id: string; channel: string; archivedAt: Date | null };
    }[];
  },
): Promise<void> {
  const membershipSets: AudienceMembershipSet[] = await Promise.all(
    version.audiences.map(async (audience) => ({
      audienceGroupId: audience.audienceGroupId,
      personIds: (
        await prisma.audienceGroupMember.findMany({
          where: { audienceGroupId: audience.audienceGroupId },
          select: { personId: true },
        })
      ).map((member) => member.personId),
    })),
  );

  const allPersonIds = [...new Set(membershipSets.flatMap((set) => set.personIds))];
  const contactMethodRows = await prisma.contactMethod.findMany({
    where: { personId: { in: allPersonIds }, archivedAt: null },
    include: { consent: true },
  });

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

  const rows = [
    ...expanded.map((recipient) => {
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
          status: 'Pending' as const,
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
        channel: 'FacebookPage' as const,
        destinationId: recipient.destinationId,
        contactMethodId: null,
        sourceAudienceGroupId: null,
        idempotencyKey: recipient.idempotencyKey,
        status: 'Pending' as const,
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
    }),
    ...skipped.map((skip) => ({
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
      status: 'Skipped' as const,
      skipReason: skip.reason,
      resolvedText: null,
      resolvedImageAssetId: null,
    })),
  ];

  if (rows.length > 0) {
    await prisma.deliveryRecipient.createMany({ data: rows });
  }
}

async function recomputeBatchCounts(prisma: PrismaClient, batchId: string): Promise<void> {
  const [totalRecipients, sentCount, deadLetteredCount, skippedCount] = await Promise.all([
    prisma.deliveryRecipient.count({ where: { deliveryBatchId: batchId } }),
    prisma.deliveryRecipient.count({ where: { deliveryBatchId: batchId, status: 'Sent' } }),
    prisma.deliveryRecipient.count({ where: { deliveryBatchId: batchId, status: 'DeadLettered' } }),
    prisma.deliveryRecipient.count({ where: { deliveryBatchId: batchId, status: 'Skipped' } }),
  ]);
  await prisma.deliveryBatch.update({
    where: { id: batchId },
    data: { totalRecipients, sentCount, deadLetteredCount, skippedCount },
  });
}

export function startSchedulePoller(deps: SchedulePollerDeps, intervalMs: number): NodeJS.Timeout {
  const tick = (): void => {
    void processDueSchedules(deps).then((count) => {
      if (count > 0) {
        logger.info({ count }, 'Started scheduled campaign deliveries');
      }
    });
  };
  tick();
  return setInterval(tick, intervalMs);
}
