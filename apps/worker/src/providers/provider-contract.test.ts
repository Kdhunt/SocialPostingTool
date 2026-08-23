import { describe, expect, it } from 'vitest';
import { SimulatedEmailProviderAdapter } from './email/simulated-email.adapter.js';
import { SimulatedSmsProviderAdapter } from './sms/simulated-sms.adapter.js';
import { SimulatedFacebookPageProviderAdapter } from './facebook/simulated-facebook-page.adapter.js';

describe('provider adapter contracts (simulated)', () => {
  it('email maps permanent and rate-limit failures to domain error codes', async () => {
    const adapter = new SimulatedEmailProviderAdapter();
    const permanent = await adapter.send({
      destinationId: 'd1',
      toAddress: 'simulate-permanent-failure@example.test',
      subject: 't',
      body: 'b',
    });
    expect(permanent.success).toBe(false);
    if (!permanent.success) expect(permanent.errorCode).toBe('invalid_recipient');

    const rateLimited = await adapter.send({
      destinationId: 'd1',
      toAddress: 'simulate-transient-failure@example.test',
      subject: 't',
      body: 'b',
    });
    expect(rateLimited.success).toBe(false);
    if (!rateLimited.success) expect(rateLimited.errorCode).toBe('rate_limited');

    const ok = await adapter.send({
      destinationId: 'd1',
      toAddress: 'ok@example.test',
      subject: 't',
      body: 'b',
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.providerMessageId).toMatch(/^sim-email-/);
  });

  it('sms maps fictional test numbers to permanent/transient codes', async () => {
    const adapter = new SimulatedSmsProviderAdapter();
    const permanent = await adapter.send({
      destinationId: 'd1',
      toPhoneNumber: '+1-555-0100',
      body: 'hi',
    });
    expect(permanent.success).toBe(false);
    if (!permanent.success) expect(permanent.errorCode).toBe('invalid_recipient');

    const limited = await adapter.send({
      destinationId: 'd1',
      toPhoneNumber: '+1-555-0199',
      body: 'hi',
    });
    expect(limited.success).toBe(false);
    if (!limited.success) expect(limited.errorCode).toBe('rate_limited');
  });

  it('facebook page never assumes Group publishing and returns a message id on success', async () => {
    const adapter = new SimulatedFacebookPageProviderAdapter();
    const ok = await adapter.post({
      destinationId: 'page-1',
      message: 'Ward announcement',
      imageAssetId: null,
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.providerMessageId).toMatch(/^sim-fb-/);
  });
});
