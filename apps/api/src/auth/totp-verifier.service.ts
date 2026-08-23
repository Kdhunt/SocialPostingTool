import { createHmac, randomBytes } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;

function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const normalized = input.replace(/=+$/u, '').replace(/\s+/gu, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 character in TOTP secret.');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function buildOtpAuthUri(input: { issuer: string; accountName: string; secret: string }): string {
  const label = encodeURIComponent(`${input.issuer}:${input.accountName}`);
  const issuer = encodeURIComponent(input.issuer);
  return `otpauth://totp/${label}?secret=${input.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function verifyTotpCode(secret: string, code: string, window = 1, nowMs: number = Date.now()): boolean {
  const key = decodeBase32(secret);
  const counter = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  for (let offset = -window; offset <= window; offset += 1) {
    if (hotp(key, counter + offset) === code) {
      return true;
    }
  }
  return false;
}

/** Generates the current TOTP code for a secret (used in tests only). */
export function computeTotpCode(secret: string, nowMs: number = Date.now()): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  return hotp(key, counter);
}
