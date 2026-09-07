import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveFacebookPageProviderAdapter } from './live-facebook-page.adapter.js';

describe('LiveFacebookPageProviderAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts campaign text to the page feed and does not send an internal asset id as link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '111_999' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new LiveFacebookPageProviderAdapter();
    const result = await adapter.post(
      { destinationId: 'dest-1', message: 'Fictional ward announcement', imageAssetId: 'asset-uuid' },
      { pageAccessToken: 'EAABtest', pageId: '111' },
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.providerMessageId).toBe('111_999');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ message: 'Fictional ward announcement' });
  });
});
