import { createHmac } from 'node:crypto';

/** RFC 6238 TOTP (SHA-1, 30-second step, 6 digits), the format authenticator apps use. */
export function totpCode(base32Secret: string, at: number = Date.now(), stepOffset = 0): string {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(at / 1000 / 30) + stepOffset;
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Waits until at least `marginMs` remain in the current 30-second window, so a code doesn't expire mid-submit. */
export async function freshTotpWindow(marginMs = 8_000): Promise<void> {
  const remaining = 30_000 - (Date.now() % 30_000);
  if (remaining < marginMs) {
    await new Promise((resolve) => setTimeout(resolve, remaining + 250));
  }
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character "${char}".`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
