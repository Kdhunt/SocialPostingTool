import type { PrismaClient } from '@ward-comms/database';
import {
  classifyDeliveryErrorCode,
  decideRetry,
  type TransactionalEmailAdapter,
} from '@ward-comms/domain';

const REDACTED_BODY = '[redacted after send]';

export interface ProcessOutboundMessageDeps {
  prisma: PrismaClient;
  email: TransactionalEmailAdapter;
  enqueueRetry: (outboundMessageId: string, delayMs: number) => Promise<void>;
}

export type ProcessOutboundMessageOutcome =
  | 'sent'
  | 'failed'
  | 'retry_scheduled'
  | 'already_terminal'
  | 'not_found';

/**
 * Sends one transactional outbox row. Idempotent: a duplicate job for an
 * already-sent message returns already_terminal without calling the provider.
 */
export async function processOutboundMessage(
  deps: ProcessOutboundMessageDeps,
  outboundMessageId: string,
): Promise<ProcessOutboundMessageOutcome> {
  const message = await deps.prisma.outboundMessage.findUnique({ where: { id: outboundMessageId } });
  if (!message) return 'not_found';

  const claimed = await claimForSending(deps.prisma, message.id);
  if (!claimed) return 'already_terminal';

  const attemptNumber = message.attemptCount + 1;
  await deps.prisma.outboundMessage.update({
    where: { id: message.id },
    data: { attemptCount: attemptNumber },
  });

  const result = await deps.email.send({
    toAddress: message.toAddress,
    subject: message.subject,
    body: claimed.body,
    idempotencyKey: message.idempotencyKey,
  });

  if (result.success) {
    await deps.prisma.outboundMessage.update({
      where: { id: message.id },
      data: {
        status: 'Sent',
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        lastError: null,
        body: REDACTED_BODY,
      },
    });
    return 'sent';
  }

  const failureKind = classifyDeliveryErrorCode(result.errorCode);
  const decision = decideRetry({ attemptNumber, failureKind });
  if (decision.shouldRetry && decision.delayMs !== null) {
    const nextAttemptAt = new Date(Date.now() + decision.delayMs);
    await deps.prisma.outboundMessage.update({
      where: { id: message.id },
      data: {
        status: 'Pending',
        lastError: result.errorMessage.slice(0, 500),
        nextAttemptAt,
      },
    });
    await deps.enqueueRetry(message.id, decision.delayMs);
    return 'retry_scheduled';
  }

  await deps.prisma.outboundMessage.update({
    where: { id: message.id },
    data: {
      status: 'Failed',
      lastError: result.errorMessage.slice(0, 500),
    },
  });
  return 'failed';
}

async function claimForSending(
  prisma: PrismaClient,
  id: string,
): Promise<{ body: string } | null> {
  const now = new Date();
  const claimed = await prisma.outboundMessage.updateMany({
    where: {
      id,
      status: 'Pending',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    data: { status: 'Sending' },
  });
  if (claimed.count === 0) {
    return null;
  }
  const row = await prisma.outboundMessage.findUnique({ where: { id } });
  return row ? { body: row.body } : null;
}

export async function processDueOutboundMessages(
  deps: ProcessOutboundMessageDeps,
  limit = 25,
): Promise<number> {
  const now = new Date();
  const due = await deps.prisma.outboundMessage.findMany({
    where: {
      status: 'Pending',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  let processed = 0;
  for (const row of due) {
    await processOutboundMessage(deps, row.id);
    processed += 1;
  }
  return processed;
}
