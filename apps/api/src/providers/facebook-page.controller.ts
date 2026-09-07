import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  chooseFacebookPageRequestSchema,
  connectFacebookPageRequestSchema,
  type FacebookPageConnectionDto,
  type FacebookPageConnectionListResponse,
  type FacebookPageOauthChoicesResponse,
  type FacebookPageOauthStartResponse,
} from '@ward-comms/validation';
import { parseBody } from '../common/parse-body.util.js';
import { InvalidSignedTokenError, signToken, verifyToken } from '../common/signed-token.util.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { getAuthCookieOptions } from '../auth/auth-cookie.util.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { APP_CONFIG } from '../config/app-config.module.js';
import type { AppConfig } from '@ward-comms/config';
import { decryptProviderSecret, encryptProviderSecret } from './provider-credential-cipher.js';
import type { FacebookManagedPage } from './facebook-graph.adapter.js';
import {
  FACEBOOK_OAUTH_PAGES_COOKIE,
  FACEBOOK_OAUTH_PAGES_TTL_MS,
  FacebookPageConnectionService,
} from './facebook-page-connection.service.js';
import type { ProviderCredentialActionContext } from './provider-credentials.service.js';

interface FacebookOauthState extends Record<string, unknown> {
  wardId: string;
  userId: string;
  purpose: 'facebook_page_oauth';
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function buildContext(user: AuthContext['user'], req: Request): ProviderCredentialActionContext {
  return { actorUserId: user.id, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('facebook-page')
export class FacebookPageController {
  constructor(
    @Inject(FacebookPageConnectionService) private readonly pages: FacebookPageConnectionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @RequirePermission('campaigns.send')
  @Get()
  async list(@CurrentUser() user: AuthContext['user']): Promise<FacebookPageConnectionListResponse> {
    return this.pages.list(user.wardId);
  }

  @RequirePermission('campaigns.send')
  @Post('connect')
  async connect(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<FacebookPageConnectionDto> {
    const dto = parseBody(connectFacebookPageRequestSchema, body);
    return this.pages.connect(user.wardId, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.send')
  @Post('pages/:pageId/disconnect')
  async disconnect(
    @Param('pageId') pageId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.pages.disconnect(user.wardId, pageId, buildContext(user, req));
    return { ok: true };
  }

  @RequirePermission('campaigns.send')
  @Get('oauth/start')
  startOauth(@CurrentUser() user: AuthContext['user']): FacebookPageOauthStartResponse {
    const state = signToken<FacebookOauthState>(
      { wardId: user.wardId, userId: user.id, purpose: 'facebook_page_oauth' },
      this.config.session.secret,
      OAUTH_STATE_TTL_MS,
    );
    return { authorizationUrl: this.pages.authorizationUrl(state) };
  }

  @RequirePermission('campaigns.send')
  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const settingsUrl = new URL('/admin/facebook-page', this.config.web.url);
    if (error) {
      settingsUrl.searchParams.set('error', 'Facebook did not authorize Page access.');
      res.redirect(settingsUrl.toString());
      return;
    }
    if (!code || !state) {
      settingsUrl.searchParams.set('error', 'Facebook Page connection was cancelled or incomplete.');
      res.redirect(settingsUrl.toString());
      return;
    }

    try {
      const payload = verifyToken<FacebookOauthState>(state, this.config.session.secret);
      if (payload.purpose !== 'facebook_page_oauth' || payload.wardId !== user.wardId || payload.userId !== user.id) {
        throw new InvalidSignedTokenError('ward mismatch');
      }
    } catch {
      settingsUrl.searchParams.set('error', 'This Facebook connection request expired. Start again from this ward.');
      res.redirect(settingsUrl.toString());
      return;
    }

    try {
      const managed = await this.pages.pagesFromAuthorizationCode(code);
      if (managed.length === 0) {
        settingsUrl.searchParams.set('error', 'No Facebook Pages were available on that account.');
        res.redirect(settingsUrl.toString());
        return;
      }
      if (managed.length === 1) {
        const page = managed[0];
        if (!page) {
          settingsUrl.searchParams.set('error', 'No Facebook Pages were available on that account.');
          res.redirect(settingsUrl.toString());
          return;
        }
        await this.pages.connect(
          user.wardId,
          { pageId: page.pageId, pageAccessToken: page.pageAccessToken, pageName: page.pageName },
          buildContext(user, req),
        );
        settingsUrl.searchParams.set('connected', '1');
        res.redirect(settingsUrl.toString());
        return;
      }

      res.cookie(
        FACEBOOK_OAUTH_PAGES_COOKIE,
        encryptProviderSecret(
          this.pages.encodePendingOauthPages(user.wardId, managed),
          this.config.providerCredentialsEncryptionKey,
        ),
        getAuthCookieOptions({ maxAge: FACEBOOK_OAUTH_PAGES_TTL_MS }),
      );
      settingsUrl.searchParams.set('choose', '1');
      res.redirect(settingsUrl.toString());
    } catch (caught) {
      settingsUrl.searchParams.set(
        'error',
        caught instanceof Error ? caught.message : 'Unable to connect a Facebook Page.',
      );
      res.redirect(settingsUrl.toString());
    }
  }

  @RequirePermission('campaigns.send')
  @Get('oauth/choices')
  oauthChoices(
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): FacebookPageOauthChoicesResponse {
    const pages = this.readPendingPages(req, user.wardId);
    return { pages: this.pages.choicesFromManagedPages(pages) };
  }

  @RequirePermission('campaigns.send')
  @Post('oauth/choose')
  async choosePage(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FacebookPageConnectionDto> {
    const dto = parseBody(chooseFacebookPageRequestSchema, body);
    const pages = this.readPendingPages(req, user.wardId);
    const selected = pages.find((page) => page.pageId === dto.pageId);
    if (!selected) {
      throw new BadRequestException('That Facebook Page is not in the current connection session.');
    }
    const connected = await this.pages.connect(
      user.wardId,
      { pageId: selected.pageId, pageAccessToken: selected.pageAccessToken, pageName: selected.pageName },
      buildContext(user, req),
    );
    res.clearCookie(FACEBOOK_OAUTH_PAGES_COOKIE, getAuthCookieOptions({ maxAge: FACEBOOK_OAUTH_PAGES_TTL_MS }));
    return connected;
  }

  private readPendingPages(req: Request, wardId: string): FacebookManagedPage[] {
    const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[FACEBOOK_OAUTH_PAGES_COOKIE];
    if (!raw) {
      throw new BadRequestException('Choose a Facebook Page from the current connection session.');
    }
    try {
      return this.pages.decodePendingOauthPages(
        decryptProviderSecret(raw, this.config.providerCredentialsEncryptionKey),
        wardId,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('The Facebook Page list expired. Connect again.');
    }
  }
}

export type { FacebookManagedPage };
