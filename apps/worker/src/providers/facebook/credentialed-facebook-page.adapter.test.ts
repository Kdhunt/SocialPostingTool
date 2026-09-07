import { describe, expect, it, vi } from 'vitest';
import { encryptProviderSecret } from '../credentials/cipher.js';
import type { ProviderCredentialLookup, StoredProviderCredential } from '../credentials/types.js';
import { CredentialedFacebookPageProviderAdapter } from './credentialed-facebook-page.adapter.js';

describe('CredentialedFacebookPageProviderAdapter', () => {
  it('looks up credentials for the destination ward, not a shared page token', async () => {
    const findActive = vi.fn(async (): Promise<StoredProviderCredential | null> => {
      return {
        channel: 'FacebookPage',
        providerAccountReference: '111',
        encryptedPayload: encryptProviderSecret(
          JSON.stringify({ pageAccessToken: 'token-ward-a', pageId: '111' }),
          'a'.repeat(32),
        ),
        expiresAt: null,
        revokedAt: null,
      };
    });
    const lookup: ProviderCredentialLookup = { findActive };
    const prisma = {
      communicationDestination: {
        findUnique: async () => ({
          id: 'dest-a',
          wardId: 'ward-a',
          channel: 'FacebookPage',
          providerAccountReference: '111',
          archivedAt: null,
        }),
      },
    } as never;

    const adapter = new CredentialedFacebookPageProviderAdapter(prisma, lookup, 'a'.repeat(32), false);
    const result = await adapter.post({
      destinationId: 'dest-a',
      message: 'Fictional ward announcement',
      imageAssetId: null,
    });

    expect(result.success).toBe(true);
    expect(findActive).toHaveBeenCalledWith('ward-a', 'FacebookPage', '111');
  });
});
