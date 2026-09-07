import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  facebookPageCredentialsJson,
  facebookPageDestinationName,
  facebookPageProviderAccountReference,
} from '@ward-comms/domain';
import type { AppConfig } from '@ward-comms/config';
import type {
  ConnectFacebookPageRequest,
  FacebookPageChoiceDto,
  FacebookPageConnectionDto,
  FacebookPageConnectionListResponse,
} from '@ward-comms/validation';
import { CommunicationDestinationRepository } from '../audiences/repositories/communication-destination.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { APP_CONFIG } from '../config/app-config.module.js';
import { FACEBOOK_GRAPH_ADAPTER, type FacebookGraphAdapter, type FacebookManagedPage } from './facebook-graph.adapter.js';
import type { ProviderCredentialActionContext } from './provider-credentials.service.js';
import { ProviderCredentialsService } from './provider-credentials.service.js';
import { ProviderCredentialRepository } from './provider-credential.repository.js';

export const FACEBOOK_OAUTH_PAGES_COOKIE = 'facebook_oauth_pages';
export const FACEBOOK_OAUTH_PAGES_TTL_MS = 10 * 60 * 1000;
const FACEBOOK_OAUTH_SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement';

@Injectable()
export class FacebookPageConnectionService {
  constructor(
    @Inject(ProviderCredentialsService) private readonly credentials: ProviderCredentialsService,
    @Inject(ProviderCredentialRepository) private readonly credentialRows: ProviderCredentialRepository,
    @Inject(CommunicationDestinationRepository) private readonly destinations: CommunicationDestinationRepository,
    @Inject(FACEBOOK_GRAPH_ADAPTER) private readonly graph: FacebookGraphAdapter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  oauthEnabled(): boolean {
    return Boolean(this.config.facebook.appId && this.config.facebook.appSecret);
  }

  oauthCallbackUrl(): string {
    return new URL('/api/v1/facebook-page/oauth/callback', this.config.web.url).toString();
  }

  async list(wardId: string): Promise<FacebookPageConnectionListResponse> {
    const rows = await this.credentialRows.listActiveForWardChannel(wardId, 'FacebookPage');
    const connections: FacebookPageConnectionDto[] = [];
    for (const row of rows) {
      const destination = await this.destinations.findByWardChannelReference(
        wardId,
        'FacebookPage',
        row.providerAccountReference,
      );
      if (!destination || destination.archivedAt) {
        continue;
      }
      connections.push({
        pageId: row.providerAccountReference,
        pageName: destination.name,
        destinationId: destination.id,
        credentialId: row.id,
      });
    }
    return { oauthEnabled: this.oauthEnabled(), connections };
  }

  async connect(
    wardId: string,
    input: ConnectFacebookPageRequest,
    context: ProviderCredentialActionContext,
  ): Promise<FacebookPageConnectionDto> {
    let pageId: string;
    let credentialsJson: string;
    try {
      pageId = facebookPageProviderAccountReference(input.pageId);
      credentialsJson = facebookPageCredentialsJson({
        pageId,
        pageAccessToken: input.pageAccessToken,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid Facebook Page details.');
    }

    const credential = await this.credentials.upsert(
      wardId,
      {
        channel: 'FacebookPage',
        providerAccountReference: pageId,
        credentialsJson,
      },
      context,
    );

    const destination = await this.ensureDestination(wardId, pageId, input.pageName ?? null, context);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'facebook_page.connected',
      entityType: 'CommunicationDestination',
      entityId: destination.id,
      metadata: { pageId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      pageId,
      pageName: destination.name,
      destinationId: destination.id,
      credentialId: credential.id,
    };
  }

  async disconnect(
    wardId: string,
    pageId: string,
    context: ProviderCredentialActionContext,
  ): Promise<void> {
    let reference: string;
    try {
      reference = facebookPageProviderAccountReference(pageId);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid Facebook Page id.');
    }
    const rows = await this.credentialRows.listActiveForWardChannel(wardId, 'FacebookPage');
    const credential = rows.find((row) => row.providerAccountReference === reference);
    if (!credential) {
      throw new NotFoundException('This ward has no Facebook Page connected with that id.');
    }
    await this.credentials.revoke(wardId, credential.id, context);

    const destination = await this.destinations.findByWardChannelReference(wardId, 'FacebookPage', reference);
    if (destination && !destination.archivedAt) {
      await this.destinations.archive(destination.id);
      await this.audit.record({
        wardId,
        actorUserId: context.actorUserId,
        action: 'destination.archived',
        entityType: 'CommunicationDestination',
        entityId: destination.id,
        metadata: { pageId: reference, reason: 'facebook_page.disconnected' },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'facebook_page.disconnected',
      entityType: 'ProviderCredential',
      entityId: credential.id,
      metadata: { pageId: reference },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  authorizationUrl(state: string): string {
    if (!this.config.facebook.appId) {
      throw new BadRequestException('Facebook Page OAuth is not configured.');
    }
    const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    url.searchParams.set('client_id', this.config.facebook.appId);
    url.searchParams.set('redirect_uri', this.oauthCallbackUrl());
    url.searchParams.set('state', state);
    url.searchParams.set('scope', FACEBOOK_OAUTH_SCOPES);
    url.searchParams.set('response_type', 'code');
    return url.toString();
  }

  async pagesFromAuthorizationCode(code: string): Promise<FacebookManagedPage[]> {
    if (!this.config.facebook.appId || !this.config.facebook.appSecret) {
      throw new BadRequestException('Facebook Page OAuth is not configured.');
    }
    try {
      const userToken = await this.graph.exchangeAuthorizationCode({
        code,
        redirectUri: this.oauthCallbackUrl(),
        appId: this.config.facebook.appId,
        appSecret: this.config.facebook.appSecret,
      });
      return this.graph.listManagedPages(userToken);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Unable to list Facebook Pages for this account.',
      );
    }
  }

  choicesFromManagedPages(pages: FacebookManagedPage[]): FacebookPageChoiceDto[] {
    return pages.map((page) => ({ pageId: page.pageId, pageName: page.pageName }));
  }

  encodePendingOauthPages(wardId: string, pages: FacebookManagedPage[]): string {
    return JSON.stringify({ wardId, pages });
  }

  decodePendingOauthPages(json: string, wardId: string): FacebookManagedPage[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      throw new BadRequestException('The Facebook Page list expired. Connect again.');
    }
    if (!isPendingOauthPagesPayload(parsed)) {
      throw new BadRequestException('The Facebook Page list expired. Connect again.');
    }
    if (parsed.wardId !== wardId) {
      throw new BadRequestException(
        'This Facebook Page list belongs to a different ward. Connect again from this ward.',
      );
    }
    return parsed.pages;
  }

  private async ensureDestination(
    wardId: string,
    pageId: string,
    pageName: string | null,
    context: ProviderCredentialActionContext,
  ): Promise<{ id: string; name: string }> {
    const existing = await this.destinations.findByWardChannelReference(wardId, 'FacebookPage', pageId);
    const desiredName = await this.uniqueDestinationName(
      wardId,
      facebookPageDestinationName(pageName, pageId),
      pageId,
      existing?.id,
    );

    if (existing) {
      if (existing.archivedAt || existing.name !== desiredName) {
        const restored = await this.destinations.restore(existing.id, desiredName, pageId);
        return { id: restored.id, name: restored.name };
      }
      return { id: existing.id, name: existing.name };
    }

    const created = await this.destinations.create({
      wardId,
      name: desiredName,
      channel: 'FacebookPage',
      providerAccountReference: pageId,
    });
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'destination.created',
      entityType: 'CommunicationDestination',
      entityId: created.id,
      metadata: { channel: 'FacebookPage', pageId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return { id: created.id, name: created.name };
  }

  private async uniqueDestinationName(
    wardId: string,
    desiredName: string,
    pageId: string,
    ignoreId?: string,
  ): Promise<string> {
    const taken = await this.destinations.findByWardName(wardId, desiredName);
    if (!taken || taken.id === ignoreId) {
      return desiredName;
    }
    const suffix = ` (${pageId})`;
    return `${desiredName.slice(0, Math.max(1, 255 - suffix.length))}${suffix}`.slice(0, 255);
  }
}

interface PendingOauthPagesPayload {
  wardId: string;
  pages: FacebookManagedPage[];
}

function isPendingOauthPagesPayload(value: unknown): value is PendingOauthPagesPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as { wardId?: unknown; pages?: unknown };
  if (typeof record.wardId !== 'string' || !Array.isArray(record.pages)) {
    return false;
  }
  return record.pages.every((page) => {
    if (typeof page !== 'object' || page === null) {
      return false;
    }
    const row = page as { pageId?: unknown; pageName?: unknown; pageAccessToken?: unknown };
    return (
      typeof row.pageId === 'string' &&
      typeof row.pageName === 'string' &&
      typeof row.pageAccessToken === 'string'
    );
  });
}
