import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

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

/** Encrypts a UTF-8 plaintext secret for storage. Format: `base64(iv).base64(ciphertext).base64(authTag)`. */
export function encryptProviderSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${ciphertext.toString('base64')}.${tag.toString('base64')}`;
}

/** Decrypts an encrypted payload. Throws if malformed or authentication fails. */
export function decryptProviderSecret(payload: string, secret: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload.');
  }
  const [ivB64, dataB64, tagB64] = parts;
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error('Invalid encrypted payload.');
  }
  const key = deriveKey(secret);
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
