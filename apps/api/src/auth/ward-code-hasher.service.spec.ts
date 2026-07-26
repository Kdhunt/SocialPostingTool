import { describe, expect, it } from 'vitest';
import type { AppConfig } from '@ward-comms/config';
import { WardCodeHasherService } from './ward-code-hasher.service.js';

function fakeConfig(pepper: string): AppConfig {
  return {
    nodeEnv: 'test',
    appName: 'Ward Communications Hub',
    wardTimeZone: 'America/Denver',
    api: { host: '0.0.0.0', port: 3001, url: 'http://localhost:3001' },
    web: { port: 3000, url: 'http://localhost:3000' },
    worker: { healthPort: 3002 },
    databaseUrl: 'postgresql://user:pass@localhost:5432/db',
    redisUrl: 'redis://localhost:6379',
    session: { secret: 'a'.repeat(32), refreshTokenSecret: 'b'.repeat(32) },
    wardCodePepper: pepper,
    corsAllowedOrigins: ['http://localhost:3000'],
  };
}

describe('WardCodeHasherService', () => {
  it('hashes a ward code combined with the pepper and verifies it', async () => {
    const hasher = new WardCodeHasherService(fakeConfig('pepper-value-one'));
    const hash = await hasher.hash('fictional-ward-code');

    expect(await hasher.verify(hash, 'fictional-ward-code')).toBe(true);
    expect(await hasher.verify(hash, 'wrong-code')).toBe(false);
  });

  it('produces a different verification result for the same code under a different pepper', async () => {
    const hashedWithPepperA = await new WardCodeHasherService(fakeConfig('pepper-a')).hash('same-code');
    const verifiedWithPepperB = await new WardCodeHasherService(fakeConfig('pepper-b')).verify(
      hashedWithPepperA,
      'same-code',
    );

    expect(verifiedWithPepperB).toBe(false);
  });
});
