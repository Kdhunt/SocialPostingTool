import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { loadConfig } from '@ward-comms/config';
import { createPrismaClient } from '@ward-comms/database';
import { DELIVERY_QUEUE_NAME, type DeliveryJobData, type DeliveryJobResult } from '@ward-comms/domain';
import { createDeliveryProviders } from '@ward-comms/worker/providers';
import { processDeliveryRecipient } from '@ward-comms/worker/delivery';
import { processDueSchedules } from '@ward-comms/worker/schedule';

const DEFAULT_DELIVERY_BATCH_SIZE = 25;

export async function runSchedulePoller(): Promise<number> {
  const config = loadConfig();
  const prisma = createPrismaClient();
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  await connection.connect();
  const deliveryQueue = new Queue<DeliveryJobData, DeliveryJobResult>(DELIVERY_QUEUE_NAME, { connection });

  try {
    return await processDueSchedules({ prisma, deliveryQueue });
  } finally {
    await deliveryQueue.close();
    connection.disconnect();
    await prisma.$disconnect();
  }
}

export async function runDeliveryQueueDrain(maxJobs = DEFAULT_DELIVERY_BATCH_SIZE): Promise<number> {
  const config = loadConfig();
  const prisma = createPrismaClient();
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  await connection.connect();
  const deliveryQueue = new Queue<DeliveryJobData, DeliveryJobResult>(DELIVERY_QUEUE_NAME, { connection });
  const providers = createDeliveryProviders({
    mode: config.providerMode,
    prisma,
    encryptionKey: config.providerCredentialsEncryptionKey,
  });

  let processed = 0;
  try {
    const jobs = await deliveryQueue.getJobs(['wait', 'delayed', 'paused'], 0, maxJobs - 1);
    for (const job of jobs) {
      await processDeliveryRecipient(
        {
          prisma,
          providers,
          enqueueRetry: async (deliveryRecipientId, delayMs) => {
            await deliveryQueue.add(
              'deliver',
              { deliveryRecipientId },
              { delay: delayMs, jobId: `${deliveryRecipientId}:retry:${Date.now()}` },
            );
          },
        },
        job.data.deliveryRecipientId,
      );
      await job.remove();
      processed += 1;
    }
    return processed;
  } finally {
    await deliveryQueue.close();
    connection.disconnect();
    await prisma.$disconnect();
  }
}
