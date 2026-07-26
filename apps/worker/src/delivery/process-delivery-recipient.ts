import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@ward-comms/database';
import {
  classifyDeliveryErrorCode,
  computeBatchStatus,
  decideRetry,
  type EmailProviderAdapter,
  type FacebookPageProviderAdapter,
  type ProviderSendResult,
  type SmsProviderAdapter,
} from '@ward-comms/domain';

export interface DeliveryProviders {
  email: EmailProviderAdapter;
  sms: SmsProviderAdapter;
  facebookPage: FacebookPageProviderAdapter;
}

export interface ProcessDeliveryRecipientDeps {
  prisma: PrismaClient;
  providers: DeliveryProviders;
  enqueueRetry: (deliveryRecipientId: string, delayMs: number) => Promise<void>;
}

export type ProcessDeliveryRecipientOutcome =
  | 'sent'
  | 'dead_lettered'
  | 'retry_scheduled'
  | 'already_terminal'
  | 'not_found';

const CLAIMABLE = ['Pending', 'Queued', 'Retrying'] as const;

/**
 * Processes one delivery attempt. Idempotent via claimForSending — a
 * duplicate/redelivered job for an already-terminal recipient returns
 * already_terminal without calling a provider again.
 */
export async function processDeliveryRecipient(
  deps: ProcessDeliveryRecipientDeps,
  deliveryRecipientId: string,
): Promise<ProcessDeliveryRecipientOutcome> {
  const recipient = await deps.prisma.deliveryRecipient.findUnique({
    where: { id: deliveryRecipientId },
    include: {
      contactMethod: true,
      deliveryBatch: { select: { wardId: true, campaignId: true } },
    },
  });
  if (!recipient) return 'not_found';

  const claimed = await claimForSending(deps.prisma, recipient.id);
  if (!claimed) return 'already_terminal';

  const attemptNumber = recipient.attemptCount + 1;
  await deps.prisma.deliveryRecipient.update({
    where: { id: recipient.id },
    data: { attemptCount: attemptNumber },
  });

  const result = await callProvider(deps.providers, {
    channel: recipient.channel,
    destinationId: recipient.destinationId,
    toAddress: recipient.contactMethod?.value ?? null,
    resolvedText: recipient.resolvedText,
    resolvedImageAssetId: recipient.resolvedImageAssetId,
  });

  if (result.success) {
    await deps.prisma.deliveryAttempt.create({
      data: {
        deliveryRecipientId: recipient.id,
        attemptNumber,
        status: 'Succeeded',
        providerMessageId: result.providerMessageId,
      },
    });
    await deps.prisma.deliveryRecipient.updateMany({
      where: { id: recipient.id, status: 'Sending' },
      data: { status: 'Sent' },
    });
    await recomputeBatchRollup(deps.prisma, recipient.deliveryBatchId);
    await writeAuditEvent(deps.prisma, {
      wardId: recipient.deliveryBatch.wardId,
      action: 'delivery.recipient.sent',
      entityId: recipient.id,
      metadata: {
        campaignId: recipient.deliveryBatch.campaignId,
        channel: recipient.channel,
        attemptNumber,
      },
    });
    return 'sent';
  }

  const failureKind = classifyDeliveryErrorCode(result.errorCode);
  await deps.prisma.deliveryAttempt.create({
    data: {
      deliveryRecipientId: recipient.id,
      attemptNumber,
      status: failureKind === 'permanent' ? 'PermanentFailure' : 'Failed',
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    },
  });

  const decision = decideRetry({ attemptNumber, failureKind });
  if (decision.isDeadLetter) {
    await deps.prisma.deliveryRecipient.updateMany({
      where: { id: recipient.id, status: 'Sending' },
      data: { status: 'DeadLettered' },
    });
    await recomputeBatchRollup(deps.prisma, recipient.deliveryBatchId);
    await writeAuditEvent(deps.prisma, {
      wardId: recipient.deliveryBatch.wardId,
      action: 'delivery.recipient.dead_lettered',
      entityId: recipient.id,
      metadata: {
        campaignId: recipient.deliveryBatch.campaignId,
        channel: recipient.channel,
        attemptNumber,
        errorCode: result.errorCode,
      },
    });
    return 'dead_lettered';
  }

  await deps.prisma.deliveryRecipient.updateMany({
    where: { id: recipient.id, status: 'Sending' },
    data: { status: 'Retrying' },
  });
  await deps.enqueueRetry(recipient.id, decision.delayMs ?? 0);
  return 'retry_scheduled';
}

async function claimForSending(prisma: PrismaClient, deliveryRecipientId: string): Promise<boolean> {
  const result = await prisma.deliveryRecipient.updateMany({
    where: { id: deliveryRecipientId, status: { in: [...CLAIMABLE] } },
    data: { status: 'Sending' },
  });
  return result.count > 0;
}

async function callProvider(
  providers: DeliveryProviders,
  input: {
    channel: 'Email' | 'Sms' | 'FacebookPage';
    destinationId: string | null;
    toAddress: string | null;
    resolvedText: string | null;
    resolvedImageAssetId: string | null;
  },
): Promise<ProviderSendResult> {
  const destinationId = input.destinationId ?? 'unknown-destination';
  const body = input.resolvedText ?? '';
  switch (input.channel) {
    case 'Email':
      return providers.email.send({
        destinationId,
        toAddress: input.toAddress ?? '',
        subject: 'Ward Communications Hub',
        body,
      });
    case 'Sms':
      return providers.sms.send({
        destinationId,
        toPhoneNumber: input.toAddress ?? '',
        body,
      });
    case 'FacebookPage':
      return providers.facebookPage.post({
        destinationId,
        message: body,
        imageAssetId: input.resolvedImageAssetId,
      });
  }
}

async function writeAuditEvent(
  prisma: PrismaClient,
  input: { wardId: string; action: string; entityId: string; metadata: Record<string, unknown> },
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      wardId: input.wardId,
      actorUserId: null,
      action: input.action,
      entityType: 'DeliveryRecipient',
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue,
      ipAddress: null,
      userAgent: null,
    },
  });
}

export async function recomputeBatchRollup(prisma: PrismaClient, deliveryBatchId: string): Promise<void> {
  const [total, pendingOrInFlight, sent, deadLettered, skipped] = await Promise.all([
    prisma.deliveryRecipient.count({ where: { deliveryBatchId } }),
    prisma.deliveryRecipient.count({
      where: { deliveryBatchId, status: { in: ['Pending', 'Queued', 'Sending', 'Retrying'] } },
    }),
    prisma.deliveryRecipient.count({ where: { deliveryBatchId, status: 'Sent' } }),
    prisma.deliveryRecipient.count({ where: { deliveryBatchId, status: 'DeadLettered' } }),
    prisma.deliveryRecipient.count({ where: { deliveryBatchId, status: 'Skipped' } }),
  ]);

  const rollupStatus = computeBatchStatus({
    total,
    pendingOrInFlight,
    sent,
    deadLettered,
    skipped,
  });
  const isTerminal =
    rollupStatus === 'Completed' || rollupStatus === 'PartialFailure' || rollupStatus === 'Failed';

  await prisma.deliveryBatch.update({
    where: { id: deliveryBatchId },
    data: {
      totalRecipients: total,
      sentCount: sent,
      deadLetteredCount: deadLettered,
      skippedCount: skipped,
      status: rollupStatus,
      completedAt: isTerminal ? new Date() : null,
    },
  });

  if (isTerminal) {
    const batch = await prisma.deliveryBatch.findUnique({
      where: { id: deliveryBatchId },
      select: { campaignId: true, wardId: true },
    });
    if (batch) {
      const campaign = await prisma.campaign.findUnique({ where: { id: batch.campaignId } });
      if (campaign?.status === 'Sending') {
        await prisma.campaign.update({
          where: { id: batch.campaignId },
          data: { status: 'Sent' },
        });
        await prisma.auditEvent.create({
          data: {
            wardId: batch.wardId,
            action: 'campaign.status_changed',
            entityType: 'Campaign',
            entityId: batch.campaignId,
            metadata: { from: 'Sending', to: 'Sent', deliveryBatchId } as Prisma.InputJsonValue,
          },
        });
      }
    }
  }
}
