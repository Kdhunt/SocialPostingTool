import { createServer, type Server } from 'node:http';
import { healthResponseSchema, type HealthResponse } from '@ward-comms/validation';
import type { Redis } from 'ioredis';
import { pingRedis } from './redis-connection.js';

export interface HealthServerOptions {
  port: number;
  redisConnection: Redis;
}

async function buildHealthResponse(redisConnection: Redis): Promise<HealthResponse> {
  const redisOk = await pingRedis(redisConnection);

  return healthResponseSchema.parse({
    status: redisOk ? 'ok' : 'error',
    service: '@ward-comms/worker',
    timestamp: new Date().toISOString(),
  });
}

export function createHealthServer(options: HealthServerOptions): Server {
  const server = createServer((request, response) => {
    if (request.url !== '/health' || request.method !== 'GET') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: 'Not Found' }));
      return;
    }

    buildHealthResponse(options.redisConnection)
      .then((health) => {
        response.writeHead(health.status === 'ok' ? 200 : 503, {
          'Content-Type': 'application/json',
        });
        response.end(JSON.stringify(health));
      })
      .catch((error: unknown) => {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'Health check failed', error: String(error) }));
      });
  });

  server.listen(options.port);
  return server;
}
