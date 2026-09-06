import { randomUUID } from 'node:crypto';
import type { ProviderSendResult, TransactionalEmailAdapter, TransactionalEmailRequest } from '@ward-comms/domain';
import type { LiveEmailCredentials } from './live-email.adapter.js';
import { sendLiveEmailMessage } from './live-email.adapter.js';

/**
 * Platform transactional email (verification / password reset).
 * Does not append the campaign member footer — those emails are not
 * audience communications.
 */
export class SimulatedTransactionalEmailAdapter implements TransactionalEmailAdapter {
  async send(request: TransactionalEmailRequest): Promise<ProviderSendResult> {
    if (request.toAddress.includes('simulate-permanent-failure')) {
      return {
        success: false,
        errorCode: 'invalid_recipient',
        errorMessage: 'Simulated permanent failure: invalid recipient address.',
      };
    }
    if (request.toAddress.includes('simulate-transient-failure')) {
      return {
        success: false,
        errorCode: 'rate_limited',
        errorMessage: 'Simulated transient failure: provider rate limited.',
      };
    }
    void request.subject;
    void request.idempotencyKey;
    return { success: true, providerMessageId: `sim-txn-email-${randomUUID()}` };
  }
}

export class LiveTransactionalEmailAdapter implements TransactionalEmailAdapter {
  constructor(private readonly credentials: LiveEmailCredentials | null) {}

  async send(request: TransactionalEmailRequest): Promise<ProviderSendResult> {
    if (!this.credentials) {
      return {
        success: false,
        errorCode: 'credentials_expired',
        errorMessage: 'System email is not configured.',
      };
    }
    return sendLiveEmailMessage(
      { toAddress: request.toAddress, subject: request.subject, body: request.body },
      this.credentials,
    );
  }
}

export interface SystemEmailAdapterOptions {
  mode: 'simulated' | 'live';
  credentials: LiveEmailCredentials | null;
}

export function createSystemEmailAdapter(options: SystemEmailAdapterOptions): TransactionalEmailAdapter {
  if (options.mode === 'live') {
    return new LiveTransactionalEmailAdapter(options.credentials);
  }
  return new SimulatedTransactionalEmailAdapter();
}

export function systemEmailCredentialsFromConfig(config: {
  mode: 'simulated' | 'live';
  provider: 'sendgrid' | 'smtp';
  fromAddress: string;
  sendgridApiKey: string | undefined;
  smtp:
    | {
        host: string;
        port: number;
        user: string;
        pass: string;
        secure: boolean;
      }
    | undefined;
}): LiveEmailCredentials | null {
  if (config.mode !== 'live') {
    return null;
  }
  if (config.provider === 'sendgrid' && config.sendgridApiKey) {
    return { provider: 'sendgrid', apiKey: config.sendgridApiKey, fromAddress: config.fromAddress };
  }
  if (config.provider === 'smtp' && config.smtp) {
    return {
      provider: 'smtp',
      host: config.smtp.host,
      port: config.smtp.port,
      user: config.smtp.user,
      pass: config.smtp.pass,
      fromAddress: config.fromAddress,
      secure: config.smtp.secure,
    };
  }
  return null;
}
