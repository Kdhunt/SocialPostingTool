import { Injectable } from '@nestjs/common';
import { healthResponseSchema, type HealthResponse } from '@ward-comms/validation';

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({
      status: 'ok',
      service: '@ward-comms/api',
      timestamp: new Date().toISOString(),
    });
  }
}
