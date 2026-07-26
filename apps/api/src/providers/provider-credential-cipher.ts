import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  const trimmed = secret.trim();
  try {
    const asBase64 = Buffer.from(trimmed, 'base64');
    if (asBase64.length === 32) return asBase64;
  } catch {
    // Fall through.
  }
  return createHash('sha256').update(trimmed, 'utf8').digest();
}

/** Encrypts provider credential JSON for storage. Mirrors the worker cipher. */
export function encryptProviderSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${ciphertext.toString('base64')}.${tag.toString('base64')}`;
}
