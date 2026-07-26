import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator.js';
import type { AuthenticatedRequest } from './session-auth.guard.js';

/**
 * Enforces the permission attached via `@RequirePermission(...)`. Must run
 * after `SessionAuthGuard` (which populates `request.authContext`) — see
 * usage: `@UseGuards(SessionAuthGuard, PermissionsGuard)`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.get<string | undefined>(REQUIRE_PERMISSION_KEY, context.getHandler());

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const hasPermission = request.authContext.user.permissions.includes(requiredPermission);

    if (!hasPermission) {
      throw new ForbiddenException(`Missing required permission: ${requiredPermission}`);
    }

    return true;
  }
}
