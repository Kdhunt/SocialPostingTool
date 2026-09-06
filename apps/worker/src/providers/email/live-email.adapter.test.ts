import { describe, expect, it } from 'vitest';
import { parseLiveEmailCredentials } from './live-email.adapter.js';

describe('parseLiveEmailCredentials', () => {
  it('parses explicit sendgrid provider shape', () => {
    const creds = parseLiveEmailCredentials(
      JSON.stringify({ provider: 'sendgrid', apiKey: 'sg-key', fromAddress: 'noreply@example.test' }),
    );
    expect(creds.provider).toBe('sendgrid');
    if (creds.provider === 'sendgrid') {
      expect(creds.apiKey).toBe('sg-key');
    }
  });

  it('parses explicit resend provider shape', () => {
    const creds = parseLiveEmailCredentials(
      JSON.stringify({ provider: 'resend', apiKey: 're-key', fromAddress: 'noreply@example.test' }),
    );
    expect(creds.provider).toBe('resend');
    if (creds.provider === 'resend') {
      expect(creds.apiKey).toBe('re-key');
    }
  });

  it('parses smtp provider shape', () => {
    const creds = parseLiveEmailCredentials(
      JSON.stringify({
        provider: 'smtp',
        host: 'localhost',
        port: 1025,
        user: 'user',
        pass: 'pass',
        fromAddress: 'noreply@example.test',
      }),
    );
    expect(creds.provider).toBe('smtp');
  });

  it('accepts legacy sendgrid shape without provider field', () => {
    const creds = parseLiveEmailCredentials(JSON.stringify({ apiKey: 'k', fromAddress: 'a@b.test' }));
    expect(creds.provider).toBe('sendgrid');
  });
});
