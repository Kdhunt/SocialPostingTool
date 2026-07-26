import { loadConfig } from '@ward-comms/config';
import { logger } from './logger.js';
import { createRedisConnection } from './redis-connection.js';
import { createHealthQueue, createHealthWorker } from './health-queue.js';
import { createHealthServer } from './health-server.js';

async function bootstrap(): Promise<void> {
  // Fail fast on invalid/missing environment configuration.
  const config = loadConfig();

  const redisConnection = createRedisConnection(config.redisUrl);
  const healthQueue = createHealthQueue(redisConnection);
  const healthWorker = createHealthWorker(redisConnection);
  const healthServer = createHealthServer({
    port: config.worker.healthPort,
    redisConnection,
  });

  logger.info({ port: config.worker.healthPort }, 'Ward Communications Hub worker started');

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down worker');
    healthServer.close();
    await healthWorker.close();
    await healthQueue.close();
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
