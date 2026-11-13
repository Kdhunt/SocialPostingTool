/**
 * Live provider adapters against fake local services: a recording `fetch` for the HTTP APIs and a real SMTP
 * server on 127.0.0.1. These are the code paths production uses with PROVIDER_MODE=live; nothing here reaches
 * a real provider. Every failure is also checked against the retry policy, because whether a send is retried
 * or dead-lettered depends only on the error code.
 */
import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyDeliveryErrorCode, type ProviderSendResult } from '@ward-comms/domain';
import { CHURCH_ACCOUNT_SUBSCRIPTIONS_URL } from './communication-footer.js';
import { LiveEmailProviderAdapter, type LiveEmailCredentials } from './email/live-email.adapter.js';
import { LiveFacebookPageProviderAdapter } from './facebook/live-facebook-page.adapter.js';
import { LIVE_PROVIDER_TIMEOUT_MS } from './live-provider-call.js';
import { LiveSmsProviderAdapter } from './sms/live-sms.adapter.js';
import { installFakeFetch, type FakeFetch } from './testing/fake-fetch.js';
import { startFakeSmtpServer, type FakeSmtpServer } from './testing/fake-smtp-server.js';

const SHORT_TIMEOUT = { timeoutMs: 200 };

const email = {
  destinationId: 'dest-email',
  toAddress: 'aaron.abernathy@example.test',
  subject: 'Fictional ward picnic',
  body: 'Join us Saturday at the Maple Hollow park.',
};
const sms = { destinationId: 'dest-sms', toPhoneNumber: '+15555550101', body: 'Picnic moved to 11am.' };
const post = { destinationId: 'dest-fb', message: 'Fictional ward picnic this Saturday!', imageAssetId: null };

const sendgrid: LiveEmailCredentials = {
  provider: 'sendgrid',
  apiKey: 'SG.fictional-sendgrid-key',
  fromAddress: 'ward@example.test',
};
const resend: LiveEmailCredentials = { provider: 'resend', apiKey: 're_fictional_key', fromAddress: 'ward@example.test' };
const twilio = { accountSid: 'ACfictional000000000000000000000000', authToken: 'fictional-auth-token', fromNumber: '+15555550100' };
const facebook = { pageAccessToken: 'EAAfictionalPageToken', pageId: '1234567890' };
const SECRETS = ['SG.fictional-sendgrid-key', 're_fictional_key', twilio.authToken, facebook.pageAccessToken];

function expectFailure(result: ProviderSendResult, errorCode: string): string {
  expect(result).toMatchObject({ success: false, errorCode });
  const message = result.success ? '' : result.errorMessage;
  for (const secret of SECRETS) expect(message).not.toContain(secret);
  return message;
}

describe('live HTTP providers', () => {
  let fake: FakeFetch;
  beforeEach(() => {
    fake = installFakeFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('SendGrid email', () => {
    const adapter = new LiveEmailProviderAdapter(SHORT_TIMEOUT);

    it('sends one request in SendGrid’s shape, with the member footer, and returns its message id', async () => {
      fake.reply({ status: 202, headers: { 'x-message-id': 'sg-message-1' } });
      const result = await adapter.send(email, sendgrid);

      expect(result).toEqual({ success: true, providerMessageId: 'sg-message-1' });
      expect(fake.requests).toHaveLength(1);
      const [request] = fake.requests;
      expect(request?.url).toBe('https://api.sendgrid.com/v3/mail/send');
      expect(request?.method).toBe('POST');
      expect(request?.headers.authorization).toBe('Bearer SG.fictional-sendgrid-key');
      const body = JSON.parse(request?.body ?? '{}') as {
        personalizations: Array<{ to: Array<{ email: string }> }>;
        from: { email: string };
        subject: string;
        content: Array<{ type: string; value: string }>;
      };
      expect(body.personalizations).toEqual([{ to: [{ email: email.toAddress }] }]);
      expect(body.from).toEqual({ email: 'ward@example.test' });
      expect(body.subject).toBe(email.subject);
      expect(body.content[0]?.type).toBe('text/plain');
      expect(body.content[0]?.value.startsWith(email.body)).toBe(true);
      expect(body.content[0]?.value).toContain(CHURCH_ACCOUNT_SUBSCRIPTIONS_URL);
    });

    it.each([
      [401, 'unauthorized', 'permanent'],
      [403, 'unauthorized', 'permanent'],
      [400, 'invalid_recipient', 'permanent'],
      [422, 'invalid_recipient', 'permanent'],
      [429, 'rate_limited', 'transient'],
      [500, 'provider_unavailable', 'transient'],
      [503, 'provider_unavailable', 'transient'],
    ])('maps HTTP %i to %s (%s)', async (status, errorCode, kind) => {
      fake.reply({ status, json: { errors: [{ message: 'Fictional provider error' }] } });
      expectFailure(await adapter.send(email, sendgrid), errorCode);
      expect(classifyDeliveryErrorCode(errorCode)).toBe(kind);
    });
  });

  describe('Resend email', () => {
    const adapter = new LiveEmailProviderAdapter(SHORT_TIMEOUT);

    it('sends one request in Resend’s shape, with the member footer, and returns its id', async () => {
      fake.reply({ status: 200, json: { id: 're-message-1' } });
      const result = await adapter.send(email, resend);

      expect(result).toEqual({ success: true, providerMessageId: 're-message-1' });
      const [request] = fake.requests;
      expect(request?.url).toBe('https://api.resend.com/emails');
      expect(request?.headers.authorization).toBe('Bearer re_fictional_key');
      const body = JSON.parse(request?.body ?? '{}') as { from: string; to: string[]; subject: string; text: string };
      expect(body).toMatchObject({ from: 'ward@example.test', to: [email.toAddress], subject: email.subject });
      expect(body.text.startsWith(email.body)).toBe(true);
      expect(body.text).toContain(CHURCH_ACCOUNT_SUBSCRIPTIONS_URL);
    });

    it('treats a success status without an id as a retryable failure', async () => {
      fake.reply({ status: 200, json: {} });
      expectFailure(await adapter.send(email, resend), 'provider_unavailable');
    });

    it.each([
      [401, 'unauthorized'],
      [422, 'invalid_recipient'],
      [429, 'rate_limited'],
      [500, 'provider_unavailable'],
    ])('maps HTTP %i to %s', async (status, errorCode) => {
      fake.reply({ status, json: { name: 'fictional_error', message: 'Fictional provider error' } });
      expectFailure(await adapter.send(email, resend), errorCode);
    });

    it('maps a reply that is not JSON to a retryable failure', async () => {
      fake.reply({ status: 502, text: '<html>Bad gateway</html>' });
      expectFailure(await adapter.send(email, resend), 'provider_unavailable');
    });
  });

  describe('Twilio SMS', () => {
    const adapter = new LiveSmsProviderAdapter(SHORT_TIMEOUT);

    it('posts the message form to the account’s Messages endpoint with the SMS footer', async () => {
      fake.reply({ status: 201, json: { sid: 'SMfictional1' } });
      const result = await adapter.send(sms, twilio);

      expect(result).toEqual({ success: true, providerMessageId: 'SMfictional1' });
      const [request] = fake.requests;
      expect(request?.url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`);
      expect(request?.headers.authorization).toBe(
        `Basic ${Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64')}`,
      );
      const form = new URLSearchParams(request?.body);
      expect(form.get('To')).toBe(sms.toPhoneNumber);
      expect(form.get('From')).toBe(twilio.fromNumber);
      expect(form.get('Body')?.startsWith(sms.body)).toBe(true);
      expect(form.get('Body')).toContain(CHURCH_ACCOUNT_SUBSCRIPTIONS_URL);
    });

    it.each([
      [401, {}, 'unauthorized'],
      [400, { code: 21211, message: 'Invalid To phone number' }, 'invalid_recipient'],
      [429, {}, 'rate_limited'],
      [500, {}, 'provider_unavailable'],
    ])('maps HTTP %i to %s', async (status, json, errorCode) => {
      fake.reply({ status, json });
      expectFailure(await adapter.send(sms, twilio), errorCode);
    });
  });

  describe('Facebook Page', () => {
    const adapter = new LiveFacebookPageProviderAdapter(SHORT_TIMEOUT);

    it('posts the text to the page feed and returns the post id', async () => {
      fake.reply({ status: 200, json: { id: '1234567890_42' } });
      const result = await adapter.post(post, facebook);

      expect(result).toEqual({ success: true, providerMessageId: '1234567890_42' });
      const url = new URL(fake.requests[0]?.url ?? '');
      expect(`${url.origin}${url.pathname}`).toBe('https://graph.facebook.com/v21.0/1234567890/feed');
      expect(url.searchParams.get('access_token')).toBe(facebook.pageAccessToken);
      expect(JSON.parse(fake.requests[0]?.body ?? '{}')).toEqual({ message: post.message });
    });

    it.each([
      [400, { error: { code: 190, message: 'Fictional: token expired' } }, 'unauthorized'],
      [400, { error: { code: 100, message: 'Fictional: message rejected' } }, 'content_rejected'],
      [403, { error: { code: 200, message: 'Fictional: permission' } }, 'unauthorized'],
      [429, { error: { code: 4, message: 'Fictional: too many calls' } }, 'rate_limited'],
      [500, {}, 'provider_unavailable'],
    ])('maps HTTP %i (%j) to %s', async (status, json, errorCode) => {
      fake.reply({ status, json });
      expectFailure(await adapter.post(post, facebook), errorCode);
    });
  });

  describe('network failures and timeouts never throw and are retried', () => {
    const cases: Array<[string, () => Promise<ProviderSendResult>]> = [
      ['SendGrid', () => new LiveEmailProviderAdapter(SHORT_TIMEOUT).send(email, sendgrid)],
      ['Resend', () => new LiveEmailProviderAdapter(SHORT_TIMEOUT).send(email, resend)],
      ['Twilio', () => new LiveSmsProviderAdapter(SHORT_TIMEOUT).send(sms, twilio)],
      ['Facebook', () => new LiveFacebookPageProviderAdapter(SHORT_TIMEOUT).post(post, facebook)],
    ];

    it.each(cases)('%s: a refused connection becomes provider_unavailable', async (name, send) => {
      fake.reply({ networkError: 'ECONNREFUSED' });
      const message = expectFailure(await send(), 'provider_unavailable');
      expect(message).toBe(`${name} could not be reached (ECONNREFUSED).`);
      expect(classifyDeliveryErrorCode('provider_unavailable')).toBe('transient');
    });

    it.each(cases)('%s: a provider that never answers becomes timeout', async (name, send) => {
      fake.reply({ hang: true });
      const started = Date.now();
      const message = expectFailure(await send(), 'timeout');
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(message).toContain(name);
      expect(classifyDeliveryErrorCode('timeout')).toBe('transient');
    });

    it('uses a production time limit short enough for a serverless function', () => {
      expect(LIVE_PROVIDER_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    });
  });
});

describe('live SMTP email (fake SMTP server)', () => {
  let server: FakeSmtpServer | null = null;
  afterEach(async () => {
    await server?.close();
    server = null;
  });

  function smtp(port: number, pass = 'fictional-smtp-pass'): LiveEmailCredentials {
    return {
      provider: 'smtp',
      host: '127.0.0.1',
      port,
      user: 'fictional-smtp-user',
      pass,
      fromAddress: 'ward@example.test',
      secure: false,
    };
  }

  it('delivers one message with the sender, recipient, subject and footer the member will see', async () => {
    server = await startFakeSmtpServer({ credentials: { user: 'fictional-smtp-user', pass: 'fictional-smtp-pass' } });
    const result = await new LiveEmailProviderAdapter(SHORT_TIMEOUT).send(email, smtp(server.port));

    expect(result.success).toBe(true);
    expect(server.messages).toHaveLength(1);
    const [message] = server.messages;
    expect(message?.authUser).toBe('fictional-smtp-user');
    expect(message?.from).toBe('ward@example.test');
    expect(message?.to).toEqual([email.toAddress]);
    expect(message?.subject).toBe(email.subject);
    expect(message?.body.startsWith(email.body)).toBe(true);
    expect(message?.body).toContain(CHURCH_ACCOUNT_SUBSCRIPTIONS_URL);
  });

  it('reports a rejected login as unauthorized without repeating the password', async () => {
    server = await startFakeSmtpServer({ credentials: { user: 'fictional-smtp-user', pass: 'the-right-pass' } });
    const result = await new LiveEmailProviderAdapter(SHORT_TIMEOUT).send(email, smtp(server.port, 'a-wrong-pass'));

    const message = expectFailure(result, 'unauthorized');
    expect(message).not.toContain('a-wrong-pass');
    expect(server.messages).toHaveLength(0);
  });

  it('treats a permanent recipient rejection (5xx) as invalid_recipient', async () => {
    server = await startFakeSmtpServer({ rejectRecipients: { [email.toAddress]: 550 } });
    expectFailure(await new LiveEmailProviderAdapter(SHORT_TIMEOUT).send(email, smtp(server.port)), 'invalid_recipient');
    expect(classifyDeliveryErrorCode('invalid_recipient')).toBe('permanent');
  });

  it('keeps a temporary recipient rejection (4xx, for example greylisting) retryable', async () => {
    server = await startFakeSmtpServer({ rejectRecipients: { [email.toAddress]: 450 } });
    expectFailure(await new LiveEmailProviderAdapter(SHORT_TIMEOUT).send(email, smtp(server.port)), 'provider_unavailable');
  });

  it('reports a server that is not listening as provider_unavailable', async () => {
    const port = await unusedPort();
    const message = expectFailure(
      await new LiveEmailProviderAdapter(SHORT_TIMEOUT).send(email, smtp(port)),
      'provider_unavailable',
    );
    expect(message).toContain('SMTP server could not be reached');
  });

  it('gives up on a server that never greets within the time limit', async () => {
    server = await startFakeSmtpServer({ silent: true });
    const started = Date.now();
    expectFailure(await new LiveEmailProviderAdapter(SHORT_TIMEOUT).send(email, smtp(server.port)), 'timeout');
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});

async function unusedPort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}
