import { describe, expect, it } from 'vitest';
import { createPrismaClient } from './prisma-client.js';

describe('createPrismaClient', () => {
  it('returns the same client instance on repeated calls in non-production', () => {
    const first = createPrismaClient();
    const second = createPrismaClient();

    expect(first).toBe(second);
  });
});
