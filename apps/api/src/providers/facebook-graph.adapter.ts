const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface FacebookManagedPage {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
}

export interface FacebookGraphAdapter {
  exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    appId: string;
    appSecret: string;
  }): Promise<string>;
  listManagedPages(userAccessToken: string): Promise<FacebookManagedPage[]>;
}

/**
 * Graph API access for Facebook Page OAuth. Fetch only — no Meta SDK
 * (AGENTS.md: provider SDKs stay in adapters, never in domain).
 */
export class LiveFacebookGraphAdapter implements FacebookGraphAdapter {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    appId: string;
    appSecret: string;
  }): Promise<string> {
    const shortLived = await this.oauthToken({
      client_id: input.appId,
      client_secret: input.appSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
    });
    return this.oauthToken({
      grant_type: 'fb_exchange_token',
      client_id: input.appId,
      client_secret: input.appSecret,
      fb_exchange_token: shortLived,
    });
  }

  async listManagedPages(userAccessToken: string): Promise<FacebookManagedPage[]> {
    const url = new URL(`${GRAPH_BASE}/me/accounts`);
    url.searchParams.set('access_token', userAccessToken);
    url.searchParams.set('fields', 'id,name,access_token');
    const payload = await this.getJson(url);
    const data = Array.isArray(payload.data) ? payload.data : [];
    const pages: FacebookManagedPage[] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const record = row as { id?: unknown; name?: unknown; access_token?: unknown };
      if (typeof record.id !== 'string' || typeof record.access_token !== 'string') continue;
      pages.push({
        pageId: record.id,
        pageName: typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : record.id,
        pageAccessToken: record.access_token,
      });
    }
    return pages;
  }

  private async oauthToken(params: Record<string, string>): Promise<string> {
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const payload = await this.getJson(url);
    if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
      throw new Error(graphErrorMessage(payload, 'Facebook OAuth token exchange failed.'));
    }
    return payload.access_token;
  }

  private async getJson(url: URL): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(url.toString(), { method: 'GET' });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(graphErrorMessage(payload, 'Facebook Graph API request failed.'));
    }
    return payload;
  }
}

function graphErrorMessage(payload: Record<string, unknown>, fallback: string): string {
  const error = payload.error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export const FACEBOOK_GRAPH_ADAPTER = Symbol('FACEBOOK_GRAPH_ADAPTER');
