import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import {
  DELIVERY_QUEUE_NAME,
  type DeliveryJobData,
  type DeliveryJobOutcome,
  type DeliveryJobResult,
} from '@ward-comms/domain';
import type { PrismaClient } from '@ward-comms/database';
import {
  processDeliveryRecipient,
  type DeliveryProviders,
  type ProcessDeliveryRecipientOutcome,
} from './process-delivery-recipient.js';

export function createDeliveryQueue(
  connection: ConnectionOptions,
): Queue<DeliveryJobData, DeliveryJobResult> {
  return new Queue<DeliveryJobData, DeliveryJobResult>(DELIVERY_QUEUE_NAME, { connection });
}

export interface CreateDeliveryWorkerOptions {
  connection: ConnectionOptions;
  prisma: PrismaClient;
  providers: DeliveryProviders;
  queue: Queue<DeliveryJobData, DeliveryJobResult>;
  concurrency?: number;
}

export function createDeliveryWorker(
  options: CreateDeliveryWorkerOptions,
): Worker<DeliveryJobData, DeliveryJobResult> {
  return new Worker<DeliveryJobData, DeliveryJobResult>(
    DELIVERY_QUEUE_NAME,
    async (job: Job<DeliveryJobData>): Promise<DeliveryJobResult> => {
      const outcome = await processDeliveryRecipient(
        {
          prisma: options.prisma,
          providers: options.providers,
          enqueueRetry: async (deliveryRecipientId: string, delayMs: number): Promise<void> => {
            await options.queue.add('deliver', { deliveryRecipientId }, { delay: delayMs });
          },
        },
        job.data.deliveryRecipientId,
      );

      const outcomeMap: Record<ProcessDeliveryRecipientOutcome, DeliveryJobOutcome> = {
        sent: 'sent',
        dead_lettered: 'dead_lettered',
        retry_scheduled: 'retry_scheduled',
        already_terminal: 'sent',
        not_found: 'dead_lettered',
      };
      return { outcome: outcomeMap[outcome] };
    },
    { connection: options.connection, concurrency: options.concurrency ?? 5 },
  );
}
