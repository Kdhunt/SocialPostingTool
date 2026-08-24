import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AuthModule } from './auth.module.js';
import { LoginRateLimiterService } from './login-rate-limiter.service.js';

describe('AuthModule', () => {
  it('exports LoginRateLimiterService so AdminModule can inject it', (): void => {
    const exported = Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthModule) as unknown[];
    expect(exported).toContain(LoginRateLimiterService);
  });
});
