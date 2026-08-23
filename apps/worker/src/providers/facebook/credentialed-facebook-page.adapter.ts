import type { PrismaClient } from '@ward-comms/database';
import type {
  FacebookPageProviderAdapter,
  FacebookPageSendRequest,
  ProviderSendResult,
} from '@ward-comms/domain';
import { resolveCredentialPlaintext } from '../credentials/resolve-credentials.js';
import type { ProviderCredentialLookup } from '../credentials/types.js';
import {
  LiveFacebookPageProviderAdapter,
  parseFacebookGraphCredentials,
} from './live-facebook-page.adapter.js';
import { SimulatedFacebookPageProviderAdapter } from './simulated-facebook-page.adapter.js';

export class CredentialedFacebookPageProviderAdapter implements FacebookPageProviderAdapter {
  private readonly simulated = new SimulatedFacebookPageProviderAdapter();
  private readonly live = new LiveFacebookPageProviderAdapter();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly lookup: ProviderCredentialLookup,
    private readonly encryptionKey: string,
    private readonly useLiveProviders: boolean,
  ) {}

  async post(request: FacebookPageSendRequest): Promise<ProviderSendResult> {
    const destination = await this.prisma.communicationDestination.findUnique({
      where: { id: request.destinationId },
    });
    if (!destination || destination.archivedAt) {
      return {
        success: false,
        errorCode: 'invalid_destination',
        errorMessage: 'Destination is missing or archived.',
      };
    }
    if (destination.channel !== 'FacebookPage') {
      return {
        success: false,
        errorCode: 'invalid_destination',
        errorMessage: 'Destination is not a Facebook Page channel.',
      };
    }
    if (!destination.providerAccountReference) {
      return {
        success: false,
        errorCode: 'unauthorized',
        errorMessage: 'Destination has no provider account reference.',
      };
    }

    const resolved = await resolveCredentialPlaintext(
      this.lookup,
      this.encryptionKey,
      destination.wardId,
      'FacebookPage',
      destination.providerAccountReference,
    );
    if (!resolved.ok) {
      return { success: false, errorCode: resolved.errorCode, errorMessage: resolved.errorMessage };
    }

    try {
      const credentials = parseFacebookGraphCredentials(resolved.plaintext);
      if (this.useLiveProviders) {
        return this.live.post(request, credentials);
      }
      return this.simulated.post(request);
    } catch (error) {
      return {
        success: false,
        errorCode: 'unauthorized',
        errorMessage: error instanceof Error ? error.message : 'Invalid Facebook credentials.',
      };
    }
  }
}
