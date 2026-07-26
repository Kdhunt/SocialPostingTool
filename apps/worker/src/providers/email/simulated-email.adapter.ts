import { randomUUID } from 'node:crypto';
import type { EmailProviderAdapter, EmailSendRequest, ProviderSendResult } from '@ward-comms/domain';

/**
 * Simulated Email adapter (no SDK). Magic recipient addresses drive
 * permanent/transient failure paths for contract tests — see docs/providers.md.
 */
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
        errorCode: 'rate_limited',
        errorMessage: 'Simulated transient failure: provider rate limited.',
      };
    }
    if (request.toAddress.includes('simulate-timeout')) {
      return {
        success: false,
        errorCode: 'timeout',
        errorMessage: 'Simulated transient failure: provider timed out.',
      };
    }
    return { success: true, providerMessageId: `sim-email-${randomUUID()}` };
  }
}
