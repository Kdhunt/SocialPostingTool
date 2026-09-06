import { describe, expect, it } from 'vitest';
import { composePasswordResetEmail, composeVerificationEmail } from './account-email-copy.js';

describe('account email copy', () => {
  it('puts the verification token only in the link and never a password', () => {
    const email = composeVerificationEmail({
      appName: 'Ward Communications Hub',
      displayName: 'Jane Doe',
      webUrl: 'http://localhost:3000/',
      token: 'raw-verify-token',
    });
    expect(email.subject).toContain('Confirm');
    expect(email.body).toContain('http://localhost:3000/verify-email?token=raw-verify-token');
    expect(email.body.toLowerCase()).not.toContain('password:');
  });

  it('describes a reset without including a chosen password', () => {
    const email = composePasswordResetEmail({
      appName: 'Ward Communications Hub',
      displayName: 'Jane Doe',
      webUrl: 'https://example.test',
      token: 'raw-reset-token',
      wardName: 'Fictional Ward',
    });
    expect(email.body).toContain('https://example.test/reset-password?token=raw-reset-token');
    expect(email.body).toContain('Fictional Ward');
    expect(email.body).toContain('never send your password');
  });
});
