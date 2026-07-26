import { randomUUID } from 'node:crypto';
import type { ProviderSendResult, SmsSendRequest } from '@ward-comms/domain';
import { appendSmsFooter } from '../communication-footer.js';

export interface TwilioSmsCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export function parseTwilioSmsCredentials(plaintext: string): TwilioSmsCredentials {
  const parsed = JSON.parse(plaintext) as Partial<TwilioSmsCredentials>;
  if (!parsed.accountSid || !parsed.authToken || !parsed.fromNumber) {
    throw new Error('SMS credentials JSON must include accountSid, authToken, and fromNumber.');
  }
  return {
    accountSid: parsed.accountSid,
    authToken: parsed.authToken,
    fromNumber: parsed.fromNumber,
  };
}

export class LiveSmsProviderAdapter {
  async send(request: SmsSendRequest, credentials: TwilioSmsCredentials): Promise<ProviderSendResult> {
    const body = appendSmsFooter(request.body);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`;
    const auth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64');

    const form = new URLSearchParams();
    form.set('To', request.toPhoneNumber);
    form.set('From', credentials.fromNumber);
    form.set('Body', body);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      code?: number;
    };

    if (response.ok && payload.sid) {
      return { success: true, providerMessageId: payload.sid };
    }

    if (response.status === 401 || response.status === 403) {
      return { success: false, errorCode: 'unauthorized', errorMessage: 'Twilio rejected the credentials.' };
    }
    if (response.status === 400 || payload.code === 21211) {
      return {
        success: false,
        errorCode: 'invalid_recipient',
        errorMessage: payload.message ?? 'Invalid SMS recipient.',
      };
    }
    if (response.status === 429) {
      return { success: false, errorCode: 'rate_limited', errorMessage: 'Twilio rate limited the request.' };
    }
    return {
      success: false,
      errorCode: 'provider_unavailable',
      errorMessage: payload.message ?? `Twilio error (${response.status}).`,
    };
  }
}

/** Used by tests to verify footer is appended without calling Twilio. */
export function buildTwilioSmsBody(message: string): string {
  return appendSmsFooter(message);
}

export function fakeTwilioMessageId(): string {
  return `SM${randomUUID().replace(/-/g, '').slice(0, 32)}`;
}
