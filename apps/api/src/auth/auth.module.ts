import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { WardCodeHasherService } from './ward-code-hasher.service.js';
import { LoginRateLimiterService } from './login-rate-limiter.service.js';
import { UserRepository } from './repositories/user.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { WardCodeRepository } from './repositories/ward-code.repository.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { UnitCodeLookupService } from './unit-code-lookup.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasherService,
    WardCodeHasherService,
    LoginRateLimiterService,
    UserRepository,
    SessionRepository,
    WardCodeRepository,
    UnitCodeLookupService,
    SessionAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    UnitCodeLookupService,
    SessionAuthGuard,
    PermissionsGuard,
    UserRepository,
    PasswordHasherService,
    WardCodeRepository,
    WardCodeHasherService,
    LoginRateLimiterService,
    SessionRepository,
  ],
})
export class AuthModule {}
