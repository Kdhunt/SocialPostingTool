import { decryptProviderSecret } from './cipher.js';
import type {
  DecryptedEmailCredentials,
  DecryptedFacebookPageCredentials,
  DecryptedSmsCredentials,
  ProviderCredentialLookup,
  StoredProviderCredential,
} from './types.js';

export type CredentialResolutionFailure =
  | { ok: false; errorCode: 'credentials_expired' | 'unauthorized'; errorMessage: string }
  | { ok: true; credential: StoredProviderCredential; plaintext: string };

export async function resolveCredentialPlaintext(
  lookup: ProviderCredentialLookup,
  encryptionKey: string,
  wardId: string,
  channel: 'Email' | 'Sms' | 'FacebookPage',
  providerAccountReference: string,
): Promise<CredentialResolutionFailure> {
  const credential = await lookup.findActive(wardId, channel, providerAccountReference);
  if (!credential || credential.revokedAt) {
    return {
      ok: false,
      errorCode: 'unauthorized',
      errorMessage: 'No active provider credentials are configured for this destination.',
    };
  }
  if (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      errorCode: 'credentials_expired',
      errorMessage: 'Provider credentials have expired and must be rotated.',
    };
  }
  try {
    const plaintext = decryptProviderSecret(credential.encryptedPayload, encryptionKey);
    return { ok: true, credential, plaintext };
  } catch {
    return {
      ok: false,
      errorCode: 'unauthorized',
      errorMessage: 'Provider credentials could not be decrypted.',
    };
  }
}

export function parseEmailCredentials(plaintext: string): DecryptedEmailCredentials {
  const parsed = JSON.parse(plaintext) as Partial<DecryptedEmailCredentials>;
  if (!parsed.apiKey || !parsed.fromAddress) {
    throw new Error('Email credentials JSON must include apiKey and fromAddress.');
  }
  return { apiKey: parsed.apiKey, fromAddress: parsed.fromAddress };
}

export function parseSmsCredentials(plaintext: string): DecryptedSmsCredentials {
  const parsed = JSON.parse(plaintext) as Partial<DecryptedSmsCredentials>;
  if (!parsed.accountSid || !parsed.authToken || !parsed.fromNumber) {
    throw new Error('SMS credentials JSON must include accountSid, authToken, and fromNumber.');
  }
  return {
    accountSid: parsed.accountSid,
    authToken: parsed.authToken,
    fromNumber: parsed.fromNumber,
  };
}

export function parseFacebookPageCredentials(plaintext: string): DecryptedFacebookPageCredentials {
  const parsed = JSON.parse(plaintext) as Partial<DecryptedFacebookPageCredentials>;
  if (!parsed.pageAccessToken || !parsed.pageId) {
    throw new Error('Facebook Page credentials JSON must include pageAccessToken and pageId.');
  }
  return { pageAccessToken: parsed.pageAccessToken, pageId: parsed.pageId };
}
