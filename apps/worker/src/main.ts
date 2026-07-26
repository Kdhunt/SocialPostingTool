import { loadConfig } from '@ward-comms/config';
import { createPrismaClient } from '@ward-comms/database';
import { logger } from './logger.js';
import { createRedisConnection } from './redis-connection.js';
import { createHealthQueue, createHealthWorker } from './health-queue.js';
import { createHealthServer } from './health-server.js';
import { createDeliveryQueue, createDeliveryWorker } from './delivery/delivery-queue.js';
import { SimulatedEmailProviderAdapter } from './delivery/providers/simulated-email-provider.adapter.js';
import { SimulatedSmsProviderAdapter } from './delivery/providers/simulated-sms-provider.adapter.js';
import { SimulatedFacebookPageProviderAdapter } from './delivery/providers/simulated-facebook-page-provider.adapter.js';

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

  // Phase 9 swaps these for real SDK-backed adapters behind the same interfaces.
  const providers = {
    email: new SimulatedEmailProviderAdapter(),
    sms: new SimulatedSmsProviderAdapter(),
    facebookPage: new SimulatedFacebookPageProviderAdapter(),
  };

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

  logger.info({ port: config.worker.healthPort }, 'Ward Communications Hub worker started');

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down worker');
    healthServer.close();
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
