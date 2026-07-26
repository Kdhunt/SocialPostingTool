import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@ward-comms/validation';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  // Uses an explicit @Inject token rather than relying on TypeScript's
  // emitDecoratorMetadata reflection: apps/api runs under tsx (esbuild) in
  // dev, and esbuild does not emit the `design:paramtypes` metadata Nest's
  // implicit constructor-type injection depends on.
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
