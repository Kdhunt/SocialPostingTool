import { randomUUID } from 'node:crypto';
import type { FacebookPageSendRequest, ProviderSendResult } from '@ward-comms/domain';

export interface FacebookGraphCredentials {
  pageAccessToken: string;
  pageId: string;
}

export function parseFacebookGraphCredentials(plaintext: string): FacebookGraphCredentials {
  const parsed = JSON.parse(plaintext) as Partial<FacebookGraphCredentials>;
  if (!parsed.pageAccessToken || !parsed.pageId) {
    throw new Error('Facebook Page credentials JSON must include pageAccessToken and pageId.');
  }
  return { pageAccessToken: parsed.pageAccessToken, pageId: parsed.pageId };
}

export class LiveFacebookPageProviderAdapter {
  async post(request: FacebookPageSendRequest, credentials: FacebookGraphCredentials): Promise<ProviderSendResult> {
    const url = new URL(`https://graph.facebook.com/v21.0/${credentials.pageId}/feed`);
    url.searchParams.set('access_token', credentials.pageAccessToken);

    const body: Record<string, string> = { message: request.message };
    if (request.imageAssetId) {
      // Image assets are stored by reference; a future phase can resolve to a public URL.
      body.link = request.imageAssetId;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string; code?: number; type?: string };
    };

    if (response.ok && payload.id) {
      return { success: true, providerMessageId: payload.id };
    }

    const errorMessage = payload.error?.message ?? 'Facebook Graph API request failed.';
    const errorCode = payload.error?.code;
    if (response.status === 401 || response.status === 403 || errorCode === 190) {
      return { success: false, errorCode: 'unauthorized', errorMessage };
    }
    if (response.status === 400) {
      return { success: false, errorCode: 'content_rejected', errorMessage };
    }
    if (response.status === 429) {
      return { success: false, errorCode: 'rate_limited', errorMessage };
    }
    return { success: false, errorCode: 'provider_unavailable', errorMessage };
  }
}

export function fakeFacebookPostId(): string {
  return `${randomUUID().replace(/-/g, '')}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
