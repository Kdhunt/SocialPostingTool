import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator.js';
import type { AuthenticatedRequest } from './session-auth.guard.js';

/**
 * Enforces the permission attached via `@RequirePermission(...)`. Must run
 * after `SessionAuthGuard` (which populates `request.authContext`) — see
 * usage: `@UseGuards(SessionAuthGuard, PermissionsGuard)`.
 *
 * The decorator may sit on the route method or on the controller class; a
 * method-level requirement overrides the class-level one. Reading only the
 * method left class-level requirements unenforced.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const hasPermission = requiredPermissions.some((permission) =>
      request.authContext.user.permissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission: one of [${requiredPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
