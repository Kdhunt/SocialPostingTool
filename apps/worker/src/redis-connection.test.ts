import { describe, expect, it, vi } from 'vitest';
import { pingRedis } from './redis-connection.js';
import type { Redis } from 'ioredis';

describe('pingRedis', () => {
  it('returns true when the connection responds with PONG', async () => {
    const connection = { ping: vi.fn().mockResolvedValue('PONG') } as unknown as Redis;

    await expect(pingRedis(connection)).resolves.toBe(true);
  });

  it('returns false when the connection throws', async () => {
    const connection = {
      ping: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as Redis;

    await expect(pingRedis(connection)).resolves.toBe(false);
  });
});
