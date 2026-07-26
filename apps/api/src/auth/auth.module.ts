import { Module } from '@nestjs/common';
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
    SessionAuthGuard,
    PermissionsGuard,
  ],
  exports: [AuthService, SessionAuthGuard, PermissionsGuard, UserRepository, PasswordHasherService, WardCodeRepository, WardCodeHasherService],
})
export class AuthModule {}
