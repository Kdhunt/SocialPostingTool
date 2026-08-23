import { describe, expect, it } from 'vitest';
import { decryptProviderSecret, encryptProviderSecret } from './cipher.js';

describe('provider credential cipher', () => {
  it('round-trips a secret under the same key', () => {
    const secret = 'dev-only-provider-credentials-key!!';
    const plaintext = JSON.stringify({ apiKey: 'fictional-key-not-real', from: 'noreply@example.test' });
    const encrypted = encryptProviderSecret(plaintext, secret);
    expect(encrypted).not.toContain('fictional-key-not-real');
    expect(decryptProviderSecret(encrypted, secret)).toBe(plaintext);
  });

  it('fails decryption with the wrong key', () => {
    const encrypted = encryptProviderSecret('secret-value', 'a'.repeat(32));
    expect(() => decryptProviderSecret(encrypted, 'b'.repeat(32))).toThrow();
  });
});
