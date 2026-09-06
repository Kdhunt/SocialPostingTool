import { loadConfig } from '@ward-comms/config';
import { createPrismaClient } from '@ward-comms/database';
import { logger } from './logger.js';
import { createRedisConnection } from './redis-connection.js';
import { createHealthQueue, createHealthWorker } from './health-queue.js';
import { createHealthServer } from './health-server.js';
import { createDeliveryQueue, createDeliveryWorker } from './delivery/delivery-queue.js';
import { createDeliveryProviders } from './providers/create-delivery-providers.js';
import { startSchedulePoller } from './schedule/process-due-schedules.js';
import { createOutboundQueue, createOutboundWorker } from './outbound/outbound-queue.js';
import { processDueOutboundMessages } from './outbound/process-outbound-message.js';
import {
  createSystemEmailAdapter,
  systemEmailCredentialsFromConfig,
} from './providers/email/system-email.adapter.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  const redisConnection = createRedisConnection(config.redisUrl);
  const healthQueue = createHealthQueue(redisConnection);
  const healthWorker = createHealthWorker(redisConnection);
  const healthServer = createHealthServer({
    port: config.worker.healthPort,
    redisConnection,
  });

  const prisma = createPrismaClient();
  await prisma.$connect();

  const providers = createDeliveryProviders({
    mode: config.providerMode,
    prisma,
    encryptionKey: config.providerCredentialsEncryptionKey,
  });

  const deliveryQueue = createDeliveryQueue(redisConnection);
  const deliveryWorker = createDeliveryWorker({
    connection: redisConnection,
    prisma,
    providers,
    queue: deliveryQueue,
  });
  deliveryWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, 'Delivery job threw unexpectedly');
  });

  const systemEmail = createSystemEmailAdapter({
    mode: config.systemEmail.mode,
    credentials: systemEmailCredentialsFromConfig(config.systemEmail),
  });
  const outboundQueue = createOutboundQueue(redisConnection);
  const outboundWorker = createOutboundWorker({
    connection: redisConnection,
    prisma,
    email: systemEmail,
    queue: outboundQueue,
  });
  outboundWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, 'Outbound mail job threw unexpectedly');
  });

  const outboundPoller = setInterval(() => {
    void processDueOutboundMessages({
      prisma,
      email: systemEmail,
      enqueueRetry: async (outboundMessageId, delayMs) => {
        await outboundQueue.add(
          'outbound',
          { outboundMessageId },
          { delay: delayMs, jobId: `${outboundMessageId}:retry:${Date.now()}` },
        );
      },
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Outbound poll failed';
      logger.error({ error: message }, 'Outbound mail poller failed');
    });
  }, config.worker.schedulePollIntervalMs);

  const schedulePoller = startSchedulePoller(
    { prisma, deliveryQueue },
    config.worker.schedulePollIntervalMs,
  );

  logger.info(
    {
      port: config.worker.healthPort,
      providerMode: config.providerMode,
      systemEmailMode: config.systemEmail.mode,
      schedulePollIntervalMs: config.worker.schedulePollIntervalMs,
    },
    'Ward Communications Hub worker started',
  );

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down worker');
    clearInterval(schedulePoller);
    clearInterval(outboundPoller);
    healthServer.close();
    await outboundWorker.close();
    await outboundQueue.close();
    await deliveryWorker.close();
    await deliveryQueue.close();
    await healthWorker.close();
    await healthQueue.close();
    await prisma.$disconnect();
    redisConnection.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

bootstrap().catch((error: unknown) => {
  logger.error({ error }, 'Failed to start @ward-comms/worker');
  process.exitCode = 1;
});
