import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Derives a 32-byte AES key from the configured encryption secret.
 * Accepts either a long passphrase or base64-encoded key material.
 */
export function deriveProviderCredentialKey(secret: string): Buffer {
  const trimmed = secret.trim();
  try {
    const asBase64 = Buffer.from(trimmed, 'base64');
    if (asBase64.length === 32) {
      return asBase64;
    }
  } catch {
    // Fall through to hash derivation.
  }
  return createHash('sha256').update(trimmed, 'utf8').digest();
}

/**
 * Encrypts a UTF-8 plaintext secret for storage in ProviderCredential.
 * Format: `base64(iv).base64(ciphertext).base64(authTag)`.
 */
export function encryptProviderSecret(plaintext: string, secret: string): string {
  const key = deriveProviderCredentialKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${ciphertext.toString('base64')}.${tag.toString('base64')}`;
}

/**
 * Decrypts a ProviderCredential payload. Throws if the payload is malformed
 * or the key/tag do not match (never returns partial secrets).
 */
export function decryptProviderSecret(payload: string, secret: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted provider credential payload.');
  }
  const [ivB64, dataB64, tagB64] = parts;
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error('Invalid encrypted provider credential payload.');
  }
  const key = deriveProviderCredentialKey(secret);
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
