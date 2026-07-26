import { randomUUID } from 'node:crypto';
import type { EmailProviderAdapter, EmailSendRequest, ProviderSendResult } from '@ward-comms/domain';

/** Simulated email adapter — no network/SDK. Magic addresses drive failure paths. */
export class SimulatedEmailProviderAdapter implements EmailProviderAdapter {
  async send(request: EmailSendRequest): Promise<ProviderSendResult> {
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
        errorCode: 'provider_unavailable',
        errorMessage: 'Simulated transient failure: provider temporarily unavailable.',
      };
    }
    return { success: true, providerMessageId: `sim-email-${randomUUID()}` };
  }
}
