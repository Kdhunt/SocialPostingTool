import { randomUUID } from 'node:crypto';
import type { ProviderSendResult, SmsProviderAdapter, SmsSendRequest } from '@ward-comms/domain';

export class SimulatedSmsProviderAdapter implements SmsProviderAdapter {
  async send(request: SmsSendRequest): Promise<ProviderSendResult> {
    if (request.toPhoneNumber.includes('555-0100')) {
      return {
        success: false,
        errorCode: 'invalid_recipient',
        errorMessage: 'Simulated permanent failure: invalid phone number.',
      };
    }
    if (request.toPhoneNumber.includes('555-0199')) {
      return {
        success: false,
        errorCode: 'rate_limited',
        errorMessage: 'Simulated transient failure: provider rate limited.',
      };
    }
    return { success: true, providerMessageId: `sim-sms-${randomUUID()}` };
  }
}
