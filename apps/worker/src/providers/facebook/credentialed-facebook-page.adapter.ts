import type { PrismaClient } from '@ward-comms/database';
import type {
  FacebookPageProviderAdapter,
  FacebookPageSendRequest,
  ProviderSendResult,
} from '@ward-comms/domain';
import {
  parseFacebookPageCredentials,
  resolveCredentialPlaintext,
} from '../credentials/resolve-credentials.js';
import type { ProviderCredentialLookup } from '../credentials/types.js';
import { SimulatedFacebookPageProviderAdapter } from './simulated-facebook-page.adapter.js';

export class CredentialedFacebookPageProviderAdapter implements FacebookPageProviderAdapter {
  private readonly inner = new SimulatedFacebookPageProviderAdapter();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly lookup: ProviderCredentialLookup,
    private readonly encryptionKey: string,
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

    parseFacebookPageCredentials(resolved.plaintext);
    return this.inner.post(request);
  }
}
