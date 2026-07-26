import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  it('returns an ok status with the service name', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = controller.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('@ward-comms/api');
    expect(() => new Date(result.timestamp)).not.toThrow();
  });
});
