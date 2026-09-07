import { describe, expect, it, vi } from 'vitest';
import { LiveFacebookGraphAdapter } from './facebook-graph.adapter.js';

describe('LiveFacebookGraphAdapter', () => {
  it('exchanges a code for a long-lived user token then lists pages', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'short-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'long-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: '111', name: 'Fictional Ward Page', access_token: 'page-token' }],
        }),
      });

    const adapter = new LiveFacebookGraphAdapter(fetchImpl as unknown as typeof fetch);
    const userToken = await adapter.exchangeAuthorizationCode({
      code: 'oauth-code',
      redirectUri: 'https://www.wardcomms.online/api/v1/facebook-page/oauth/callback',
      appId: 'app-id',
      appSecret: 'app-secret',
    });
    expect(userToken).toBe('long-token');

    const pages = await adapter.listManagedPages(userToken);
    expect(pages).toEqual([{ pageId: '111', pageName: 'Fictional Ward Page', pageAccessToken: 'page-token' }]);
  });
});
