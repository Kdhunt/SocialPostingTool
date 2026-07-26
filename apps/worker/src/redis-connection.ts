import IORedis, { type Redis } from 'ioredis';

/**
 * Creates the shared Redis connection used by BullMQ queues/workers.
 * `maxRetriesPerRequest: null` is required by BullMQ for its blocking
 * connections.
 */
export function createRedisConnection(redisUrl: string): Redis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });
}

const PING_TIMEOUT_MS = 2000;

/**
 * Pings Redis with a short timeout so a health check fails fast (reporting
 * `error`) instead of hanging indefinitely while ioredis retries an
 * unreachable connection in the background.
 */
export async function pingRedis(connection: Redis): Promise<boolean> {
  try {
    const response = await Promise.race([
      connection.ping(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('Redis ping timed out')), PING_TIMEOUT_MS);
      }),
    ]);
    return response === 'PONG';
  } catch {
    return false;
  }
}
