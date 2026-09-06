import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import {
  OUTBOUND_QUEUE_NAME,
  type OutboundJobData,
  type OutboundJobOutcome,
  type OutboundJobResult,
} from '@ward-comms/domain';
import type { PrismaClient } from '@ward-comms/database';
import type { TransactionalEmailAdapter } from '@ward-comms/domain';
import {
  processOutboundMessage,
  type ProcessOutboundMessageOutcome,
} from './process-outbound-message.js';

export function createOutboundQueue(
  connection: ConnectionOptions,
): Queue<OutboundJobData, OutboundJobResult> {
  return new Queue<OutboundJobData, OutboundJobResult>(OUTBOUND_QUEUE_NAME, { connection });
}

export interface CreateOutboundWorkerOptions {
  connection: ConnectionOptions;
  prisma: PrismaClient;
  email: TransactionalEmailAdapter;
  queue: Queue<OutboundJobData, OutboundJobResult>;
  concurrency?: number;
}

export function createOutboundWorker(
  options: CreateOutboundWorkerOptions,
): Worker<OutboundJobData, OutboundJobResult> {
  return new Worker<OutboundJobData, OutboundJobResult>(
    OUTBOUND_QUEUE_NAME,
    async (job: Job<OutboundJobData>): Promise<OutboundJobResult> => {
      const outcome = await processOutboundMessage(
        {
          prisma: options.prisma,
          email: options.email,
          enqueueRetry: async (outboundMessageId: string, delayMs: number): Promise<void> => {
            await options.queue.add(
              'outbound',
              { outboundMessageId },
              { delay: delayMs, jobId: `${outboundMessageId}:retry:${Date.now()}` },
            );
          },
        },
        job.data.outboundMessageId,
      );

      const outcomeMap: Record<ProcessOutboundMessageOutcome, OutboundJobOutcome> = {
        sent: 'sent',
        failed: 'failed',
        retry_scheduled: 'retry_scheduled',
        already_terminal: 'already_terminal',
        not_found: 'failed',
      };
      return { outcome: outcomeMap[outcome] };
    },
    { connection: options.connection, concurrency: options.concurrency ?? 5 },
  );
}
