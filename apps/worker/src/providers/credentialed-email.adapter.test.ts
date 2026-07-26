import { describe, expect, it } from 'vitest';
import { encryptProviderSecret } from './credentials/cipher.js';
import { CredentialedEmailProviderAdapter } from './email/credentialed-email.adapter.js';
import type { ProviderCredentialLookup, StoredProviderCredential } from './credentials/types.js';

describe('CredentialedEmailProviderAdapter', () => {
  it('returns unauthorized when no credentials exist', async () => {
    const lookup: ProviderCredentialLookup = {
      async findActive(): Promise<StoredProviderCredential | null> {
        return null;
      },
    };
    const prisma = {
      communicationDestination: {
        findUnique: async () => ({
          id: 'dest-1',
          wardId: 'ward-1',
          channel: 'Email',
          providerAccountReference: 'acct-1',
          archivedAt: null,
        }),
      },
    } as never;

    const adapter = new CredentialedEmailProviderAdapter(prisma, lookup, 'a'.repeat(32), false);
    const result = await adapter.send({
      destinationId: 'dest-1',
      toAddress: 'ok@example.test',
      subject: 't',
      body: 'b',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe('unauthorized');
  });

  it('returns credentials_expired when the stored credential is past expiresAt', async () => {
    const lookup: ProviderCredentialLookup = {
      async findActive(): Promise<StoredProviderCredential | null> {
        return {
          channel: 'Email',
          providerAccountReference: 'acct-1',
          encryptedPayload: encryptProviderSecret(
            JSON.stringify({ apiKey: 'k', fromAddress: 'from@example.test' }),
            'a'.repeat(32),
          ),
          expiresAt: new Date(Date.now() - 60_000),
          revokedAt: null,
        };
      },
    };
    const prisma = {
      communicationDestination: {
        findUnique: async () => ({
          id: 'dest-1',
          wardId: 'ward-1',
          channel: 'Email',
          providerAccountReference: 'acct-1',
          archivedAt: null,
        }),
      },
    } as never;

    const adapter = new CredentialedEmailProviderAdapter(prisma, lookup, 'a'.repeat(32), false);
    const result = await adapter.send({
      destinationId: 'dest-1',
      toAddress: 'ok@example.test',
      subject: 't',
      body: 'b',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe('credentials_expired');
  });

  it('sends successfully when credentials are valid', async () => {
    const lookup: ProviderCredentialLookup = {
      async findActive(): Promise<StoredProviderCredential | null> {
        return {
          channel: 'Email',
          providerAccountReference: 'acct-1',
          encryptedPayload: encryptProviderSecret(
            JSON.stringify({ apiKey: 'k', fromAddress: 'from@example.test' }),
            'a'.repeat(32),
          ),
          expiresAt: null,
          revokedAt: null,
        };
      },
    };
    const prisma = {
      communicationDestination: {
        findUnique: async () => ({
          id: 'dest-1',
          wardId: 'ward-1',
          channel: 'Email',
          providerAccountReference: 'acct-1',
          archivedAt: null,
        }),
      },
    } as never;

    const adapter = new CredentialedEmailProviderAdapter(prisma, lookup, 'a'.repeat(32), false);
    const result = await adapter.send({
      destinationId: 'dest-1',
      toAddress: 'ok@example.test',
      subject: 't',
      body: 'b',
    });
    expect(result.success).toBe(true);
  });
});
