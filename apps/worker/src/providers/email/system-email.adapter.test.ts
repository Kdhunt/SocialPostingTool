import { describe, expect, it } from 'vitest';
import {
  createSystemEmailAdapter,
  systemEmailCredentialsFromConfig,
} from './system-email.adapter.js';

describe('createSystemEmailAdapter', () => {
  it('simulates a successful send without returning the body or token', async () => {
    const adapter = createSystemEmailAdapter({ mode: 'simulated', credentials: null });
    const result = await adapter.send({
      toAddress: 'member@example.com',
      subject: 'Confirm your email',
      body: 'https://example.test/verify-email?token=secret-token',
      idempotencyKey: 'account-email:EmailVerification:u1:t1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.providerMessageId.startsWith('sim-txn-email-')).toBe(true);
    }
  });

  it('returns credentials_expired in live mode when no credentials are configured', async () => {
    const adapter = createSystemEmailAdapter({ mode: 'live', credentials: null });
    const result = await adapter.send({
      toAddress: 'member@example.com',
      subject: 'Reset',
      body: 'link',
      idempotencyKey: 'k',
    });
    expect(result).toMatchObject({ success: false, errorCode: 'credentials_expired' });
  });
});

describe('systemEmailCredentialsFromConfig', () => {
  it('returns null in simulated mode', () => {
    expect(
      systemEmailCredentialsFromConfig({
        mode: 'simulated',
        provider: 'sendgrid',
        fromAddress: 'noreply@example.test',
        sendgridApiKey: 'sg',
        smtp: undefined,
      }),
    ).toBeNull();
  });

  it('builds sendgrid credentials in live mode', () => {
    expect(
      systemEmailCredentialsFromConfig({
        mode: 'live',
        provider: 'sendgrid',
        fromAddress: 'noreply@example.test',
        sendgridApiKey: 'sg-key',
        smtp: undefined,
      }),
    ).toEqual({ provider: 'sendgrid', apiKey: 'sg-key', fromAddress: 'noreply@example.test' });
  });
});
