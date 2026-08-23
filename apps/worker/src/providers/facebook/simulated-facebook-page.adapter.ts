import { randomUUID } from 'node:crypto';
import type {
  FacebookPageProviderAdapter,
  FacebookPageSendRequest,
  ProviderSendResult,
} from '@ward-comms/domain';

/**
 * Facebook Page publishing only — Group publishing is intentionally
 * unsupported (phases/09-provider-integrations.md).
 */
export class SimulatedFacebookPageProviderAdapter implements FacebookPageProviderAdapter {
  async post(request: FacebookPageSendRequest): Promise<ProviderSendResult> {
    const message = request.message ?? '';
    if (message.includes('simulate-permanent-failure')) {
      return {
        success: false,
        errorCode: 'content_rejected',
        errorMessage: 'Simulated permanent failure: content rejected by page.',
      };
    }
    if (message.includes('simulate-transient-failure')) {
      return {
        success: false,
        errorCode: 'provider_unavailable',
        errorMessage: 'Simulated transient failure: provider temporarily unavailable.',
      };
    }
    return { success: true, providerMessageId: `sim-fb-${randomUUID()}` };
  }
}
