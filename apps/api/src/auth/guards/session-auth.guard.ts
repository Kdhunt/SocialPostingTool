import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { UserSession } from '@prisma/client';
import type { AuthUser } from '@ward-comms/validation';
import { AuthService } from '../auth.service.js';
import { SESSION_COOKIE_NAME } from '../auth.constants.js';

export interface AuthContext {
  user: AuthUser;
  session: UserSession;
}

export interface AuthenticatedRequest {
  authContext: AuthContext;
}

/**
 * Authenticates a request from either credential source:
 * - Web: the `session_token` HTTP-only cookie (see main.ts cookie-parser setup).
 * - Mobile: an `Authorization: Bearer <accessToken>` header.
 *
 * Never trusts any client-supplied identity claim beyond these two
 * server-issued credentials (see .cursor/rules/security.mdc: "never trust
 * frontend authorization").
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & Partial<AuthenticatedRequest>>();

    const bearerToken = this.extractBearerToken(request);
    if (bearerToken) {
      const { user, session } = await this.authService.validateAccessToken(bearerToken);
      request.authContext = { user, session };
      return true;
    }

    const cookieToken = this.extractCookieToken(request);
    if (cookieToken) {
      const { user, session } = await this.authService.validateSessionToken(cookieToken);
      request.authContext = { user, session };
      return true;
    }

    throw new UnauthorizedException('Authentication required.');
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length).trim() || null;
  }

  private extractCookieToken(request: Request): string | null {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[SESSION_COOKIE_NAME] ?? null;
  }
}
