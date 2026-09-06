import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  GENERIC_ACCOUNT_EMAIL_MESSAGE,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  resetPasswordWithTokenRequestSchema,
  verifyEmailRequestSchema,
  totpConfirmEnrollmentRequestSchema,
  totpDisableRequestSchema,
  totpVerifyRequestSchema,
  wardCodeVerifyRequestSchema,
  type LoginResponse,
  type MobileTokenPair,
  type SessionResponse,
  type SessionSummary,
  type TotpEnrollmentResponse,
  type TotpStatusResponse,
  type TotpVerifyResponse,
  type AccountEmailAcceptedResponse,
  type ChangeEmailResponse,
  type WardCodeVerifyResponse,
} from '@ward-comms/validation';
import { parseBody } from '../common/parse-body.util.js';
import { AuthService, type RequestContext } from './auth.service.js';
import { LoginRateLimiterService } from './login-rate-limiter.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext, type AuthenticatedRequest } from './guards/session-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { DEVICE_ID_COOKIE_NAME, DEVICE_ID_COOKIE_TTL_MS, SESSION_COOKIE_NAME } from './auth.constants.js';
import { getAuthCookieOptions } from './auth-cookie.util.js';
import { AccountEmailService } from '../messaging/account-email.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(LoginRateLimiterService) private readonly rateLimiter: LoginRateLimiterService,
    @Inject(AccountEmailService) private readonly accountEmail: AccountEmailService,
  ) {}

  private resolveDeviceId(req: Request, res: Response): string {
    const existing = (req.cookies as Record<string, string | undefined> | undefined)?.[DEVICE_ID_COOKIE_NAME];
    if (existing) {
      return existing;
    }

    const deviceId = randomUUID();
    res.cookie(DEVICE_ID_COOKIE_NAME, deviceId, getAuthCookieOptions({ maxAge: DEVICE_ID_COOKIE_TTL_MS }));
    return deviceId;
  }

  private buildContext(req: Request, res: Response, clientType: 'web' | 'mobile' | undefined): RequestContext {
    return {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      deviceId: this.resolveDeviceId(req, res),
      clientType: clientType ?? 'web',
    };
  }

  private setSessionCookie(res: Response, sessionToken: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE_NAME, sessionToken, getAuthCookieOptions({ expires: expiresAt }));
  }

  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<AccountEmailAcceptedResponse> {
    if (!this.rateLimiter.consume(`${req.ip}:forgot-password`)) {
      throw new ForbiddenException('Too many password reset attempts. Please wait and try again.');
    }
    const dto = parseBody(forgotPasswordRequestSchema, body);
    await this.accountEmail.requestPasswordResetByEmail(dto.email, {
      actorUserId: null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return { message: GENERIC_ACCOUNT_EMAIL_MESSAGE };
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<AccountEmailAcceptedResponse> {
    if (!this.rateLimiter.consume(`${req.ip}:verify-email`)) {
      throw new ForbiddenException('Too many attempts. Please wait and try again.');
    }
    const dto = parseBody(verifyEmailRequestSchema, body);
    await this.accountEmail.verifyEmail(dto.token, {
      actorUserId: null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return { message: 'Your email address is confirmed.' };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPasswordWithToken(
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<AccountEmailAcceptedResponse> {
    if (!this.rateLimiter.consume(`${req.ip}:reset-password-token`)) {
      throw new ForbiddenException('Too many password reset attempts. Please wait and try again.');
    }
    const dto = parseBody(resetPasswordWithTokenRequestSchema, body);
    await this.accountEmail.completePasswordReset(dto.token, dto.password, {
      actorUserId: null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return { message: 'Your password has been updated. You can sign in with the new password.' };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const dto = parseBody(loginRequestSchema, body);
    const rateLimitKey = `${req.ip}:${dto.username}`;
    if (!this.rateLimiter.consume(rateLimitKey)) {
      throw new ForbiddenException('Too many sign-in attempts. Please wait and try again.');
    }

    const context = this.buildContext(req, res, dto.clientType);
    const outcome = await this.authService.login(dto.username, dto.password, context);

    if (outcome.status === 'totp_required') {
      return { status: 'totp_required', loginTicket: outcome.loginTicket };
    }

    if (outcome.status === 'ward_code_required') {
      return { status: 'ward_code_required', loginTicket: outcome.loginTicket };
    }

    if (outcome.status !== 'ok') {
      throw new ForbiddenException('Unexpected sign-in state.');
    }

    this.rateLimiter.reset(rateLimitKey);
    if (outcome.sessionToken) {
      this.setSessionCookie(res, outcome.sessionToken, outcome.sessionExpiresAt);
    }
    return { status: 'ok', user: outcome.user, tokens: outcome.tokens };
  }

  @Post('totp')
  @HttpCode(200)
  async verifyTotp(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TotpVerifyResponse> {
    const dto = parseBody(totpVerifyRequestSchema, body);
    const rateLimitKey = `${req.ip}:totp`;
    if (!this.rateLimiter.consume(rateLimitKey)) {
      throw new ForbiddenException('Too many attempts. Please wait and try again.');
    }

    const context = this.buildContext(req, res, dto.clientType);
    const outcome = await this.authService.verifyTotp(dto.loginTicket, dto.code, context);

    if (outcome.status === 'ward_code_required') {
      return { status: 'ward_code_required', loginTicket: outcome.loginTicket };
    }

    if (outcome.status !== 'ok') {
      throw new ForbiddenException('Unexpected sign-in state.');
    }

    this.rateLimiter.reset(rateLimitKey);
    if (outcome.sessionToken) {
      this.setSessionCookie(res, outcome.sessionToken, outcome.sessionExpiresAt);
    }
    return { status: 'ok', user: outcome.user, tokens: outcome.tokens };
  }

  @UseGuards(SessionAuthGuard)
  @Get('totp/status')
  async getTotpStatus(@CurrentUser() user: AuthContext['user']): Promise<TotpStatusResponse> {
    return this.authService.getTotpStatus(user.id);
  }

  @UseGuards(SessionAuthGuard)
  @Post('totp/enroll')
  @HttpCode(200)
  async beginTotpEnrollment(@CurrentUser() user: AuthContext['user']): Promise<TotpEnrollmentResponse> {
    return this.authService.beginTotpEnrollment(user.id);
  }

  @UseGuards(SessionAuthGuard)
  @Post('totp/confirm')
  @HttpCode(204)
  async confirmTotpEnrollment(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const dto = parseBody(totpConfirmEnrollmentRequestSchema, body);
    const context = this.buildContext(req, res, 'web');
    await this.authService.confirmTotpEnrollment(user.id, dto.code, context);
    res.clearCookie(SESSION_COOKIE_NAME);
  }

  @UseGuards(SessionAuthGuard)
  @Post('totp/disable')
  @HttpCode(204)
  async disableTotp(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const dto = parseBody(totpDisableRequestSchema, body);
    const context = this.buildContext(req, res, 'web');
    await this.authService.disableTotp(user.id, dto.password, dto.code, context);
    res.clearCookie(SESSION_COOKIE_NAME);
  }

  @Post('ward-code')
  @HttpCode(200)
  async verifyWardCode(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WardCodeVerifyResponse> {
    const dto = parseBody(wardCodeVerifyRequestSchema, body);
    const rateLimitKey = `${req.ip}:ward-code`;
    if (!this.rateLimiter.consume(rateLimitKey)) {
      throw new ForbiddenException('Too many attempts. Please wait and try again.');
    }

    const context = this.buildContext(req, res, dto.clientType);
    const outcome = await this.authService.verifyWardCode(dto.loginTicket, dto.wardCode, context);

    if (outcome.status !== 'ok') {
      // verifyWardCode never returns ward_code_required, but keep the type checker honest.
      throw new ForbiddenException('Unexpected sign-in state.');
    }

    this.rateLimiter.reset(rateLimitKey);
    if (outcome.sessionToken) {
      this.setSessionCookie(res, outcome.sessionToken, outcome.sessionExpiresAt);
    }
    return { status: 'ok', user: outcome.user, tokens: outcome.tokens };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown, @Req() req: Request): Promise<{ tokens: MobileTokenPair }> {
    const dto = parseBody(refreshRequestSchema, body);
    const { tokens } = await this.authService.refresh(dto.refreshToken, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      deviceId: 'mobile',
      clientType: 'mobile',
    });
    return { tokens };
  }

  @UseGuards(SessionAuthGuard)
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request & AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { authContext } = req;
    await this.authService.logout(authContext.session.id, authContext.user.id, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      deviceId: authContext.session.deviceId ?? 'unknown',
      clientType: 'web',
    });
    res.clearCookie(SESSION_COOKIE_NAME);
  }

  @UseGuards(SessionAuthGuard)
  @Get('session')
  getSession(@CurrentUser() user: AuthContext['user']): SessionResponse {
    return { user };
  }

  @UseGuards(SessionAuthGuard)
  @Patch('email')
  async changeEmail(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<ChangeEmailResponse> {
    if (!this.rateLimiter.consume(`${req.ip}:change-email`)) {
      throw new ForbiddenException('Too many email change attempts. Please wait and try again.');
    }
    const dto = parseBody(changeEmailRequestSchema, body);
    const updated = await this.accountEmail.changeEmailForUser(user.id, dto.email, {
      actorUserId: user.id,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return {
      email: updated.email,
      emailVerifiedAt: updated.emailVerifiedAt,
      message: 'Email updated. Confirm the new address from the message we queued.',
    };
  }

  @UseGuards(SessionAuthGuard)
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (!this.rateLimiter.consume(`${req.ip}:change-password`)) {
      throw new ForbiddenException('Too many password change attempts. Please wait and try again.');
    }
    const dto = parseBody(changePasswordRequestSchema, body);
    const context = this.buildContext(req, res, 'web');
    await this.authService.changeOwnPassword(user.id, dto.currentPassword, dto.newPassword, context);
    res.clearCookie(SESSION_COOKIE_NAME);
  }

  @UseGuards(SessionAuthGuard)
  @Post('verification-email')
  @HttpCode(204)
  async resendOwnVerificationEmail(@CurrentUser() user: AuthContext['user'], @Req() req: Request): Promise<void> {
    if (!this.rateLimiter.consume(`${req.ip}:own-verification-email`)) {
      throw new ForbiddenException('Too many email requests. Please wait and try again.');
    }
    await this.accountEmail.queueVerificationForUser(user.id, {
      actorUserId: user.id,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @UseGuards(SessionAuthGuard)
  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthContext['user']): Promise<SessionSummary[]> {
    const sessions = await this.authService.listSessions(user.id);
    return sessions.map((session) => ({
      id: session.id,
      deviceId: session.deviceId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
    }));
  }

  @UseGuards(SessionAuthGuard)
  @Post('sessions/:id/revoke')
  @HttpCode(204)
  async revokeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<void> {
    await this.authService.revokeSession(sessionId, user.id, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      deviceId: 'n/a',
      clientType: 'web',
    });
  }

  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermission('users.manage')
  @Post('users/:id/disable')
  @HttpCode(204)
  async disableUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<void> {
    await this.authService.disableAccount(targetUserId, user.id, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      deviceId: 'n/a',
      clientType: 'web',
    });
  }

  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermission('users.manage')
  @Post('users/:id/enable')
  @HttpCode(204)
  async enableUser(
    @Param('id') targetUserId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<void> {
    await this.authService.enableAccount(targetUserId, user.id, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      deviceId: 'n/a',
      clientType: 'web',
    });
  }
}
