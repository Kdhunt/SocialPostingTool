import { randomUUID } from 'node:crypto';
import type { EmailSendRequest, ProviderSendResult } from '@ward-comms/domain';
import { appendEmailFooter } from '../communication-footer.js';

export type EmailProviderKind = 'sendgrid' | 'smtp';

export interface SendGridEmailCredentials {
  provider: 'sendgrid';
  apiKey: string;
  fromAddress: string;
}

export interface SmtpEmailCredentials {
  provider: 'smtp';
  host: string;
  port: number;
  user: string;
  pass: string;
  fromAddress: string;
  secure?: boolean;
}

export type LiveEmailCredentials = SendGridEmailCredentials | SmtpEmailCredentials;

export function parseLiveEmailCredentials(plaintext: string): LiveEmailCredentials {
  const parsed = JSON.parse(plaintext) as Partial<LiveEmailCredentials & { apiKey?: string; fromAddress?: string }>;
  if (parsed.provider === 'sendgrid') {
    if (!parsed.apiKey || !parsed.fromAddress) {
      throw new Error('SendGrid credentials must include apiKey and fromAddress.');
    }
    return { provider: 'sendgrid', apiKey: parsed.apiKey, fromAddress: parsed.fromAddress };
  }
  if (parsed.provider === 'smtp') {
    const smtp = parsed as Partial<SmtpEmailCredentials>;
    if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass || !smtp.fromAddress) {
      throw new Error('SMTP credentials must include host, port, user, pass, and fromAddress.');
    }
    return {
      provider: 'smtp',
      host: smtp.host,
      port: smtp.port,
      user: smtp.user,
      pass: smtp.pass,
      fromAddress: smtp.fromAddress,
      secure: smtp.secure ?? false,
    };
  }
  // Backward-compatible shape without explicit provider field.
  if (parsed.apiKey && parsed.fromAddress) {
    return { provider: 'sendgrid', apiKey: parsed.apiKey, fromAddress: parsed.fromAddress };
  }
  throw new Error('Email credentials must specify provider "sendgrid" or "smtp".');
}

export class LiveEmailProviderAdapter {
  async send(request: EmailSendRequest, credentials: LiveEmailCredentials): Promise<ProviderSendResult> {
    const body = appendEmailFooter(request.body);
    if (credentials.provider === 'sendgrid') {
      return sendViaSendGrid(request, credentials, body);
    }
    return sendViaSmtp(request, credentials, body);
  }
}

async function sendViaSendGrid(
  request: EmailSendRequest,
  credentials: SendGridEmailCredentials,
  body: string,
): Promise<ProviderSendResult> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: request.toAddress }] }],
      from: { email: credentials.fromAddress },
      subject: request.subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });

  if (response.ok) {
    const messageId = response.headers.get('x-message-id') ?? `sendgrid-${randomUUID()}`;
    return { success: true, providerMessageId: messageId };
  }

  const status = response.status;
  const errorText = await response.text().catch(() => 'SendGrid request failed.');
  if (status === 401 || status === 403) {
    return { success: false, errorCode: 'unauthorized', errorMessage: 'SendGrid rejected the API key.' };
  }
  if (status === 400 || status === 422) {
    return { success: false, errorCode: 'invalid_recipient', errorMessage: errorText.slice(0, 500) };
  }
  if (status === 429) {
    return { success: false, errorCode: 'rate_limited', errorMessage: 'SendGrid rate limited the request.' };
  }
  return { success: false, errorCode: 'provider_unavailable', errorMessage: errorText.slice(0, 500) };
}

async function sendViaSmtp(
  request: EmailSendRequest,
  credentials: SmtpEmailCredentials,
  body: string,
): Promise<ProviderSendResult> {
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.secure ?? false,
      auth: { user: credentials.user, pass: credentials.pass },
    });
    const info = await transport.sendMail({
      from: credentials.fromAddress,
      to: request.toAddress,
      subject: request.subject,
      text: body,
    });
    return { success: true, providerMessageId: info.messageId ?? `smtp-${randomUUID()}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMTP send failed.';
    if (/auth/i.test(message)) {
      return { success: false, errorCode: 'unauthorized', errorMessage: message };
    }
    if (/recipient|address/i.test(message)) {
      return { success: false, errorCode: 'invalid_recipient', errorMessage: message };
    }
    return { success: false, errorCode: 'provider_unavailable', errorMessage: message };
  }
}
