import { describe, expect, it } from 'vitest';
import { buildOtpAuthUri, generateTotpSecret, verifyTotpCode } from './totp-verifier.service.js';

describe('TotpVerifierService', () => {
  it('generates secrets and otpauth URIs', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(16);

    const uri = buildOtpAuthUri({
      issuer: 'Ward Comms',
      accountName: 'admin',
      secret,
    });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(`secret=${secret}`);
  });

  it('rejects invalid codes outside the verification window', () => {
    const secret = generateTotpSecret();
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    expect(verifyTotpCode(secret, '000000', 0, now)).toBe(false);
  });
});
