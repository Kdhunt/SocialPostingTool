import type { PrismaClient } from '@ward-comms/database';
import type { ProviderSendResult, SmsProviderAdapter, SmsSendRequest } from '@ward-comms/domain';
import { resolveCredentialPlaintext } from '../credentials/resolve-credentials.js';
import type { ProviderCredentialLookup } from '../credentials/types.js';
import { LiveSmsProviderAdapter, parseTwilioSmsCredentials } from './live-sms.adapter.js';
import { SimulatedSmsProviderAdapter } from './simulated-sms.adapter.js';

export class CredentialedSmsProviderAdapter implements SmsProviderAdapter {
  private readonly simulated = new SimulatedSmsProviderAdapter();
  private readonly live = new LiveSmsProviderAdapter();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly lookup: ProviderCredentialLookup,
    private readonly encryptionKey: string,
    private readonly useLiveProviders: boolean,
  ) {}

  async send(request: SmsSendRequest): Promise<ProviderSendResult> {
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
      'Sms',
      destination.providerAccountReference,
    );
    if (!resolved.ok) {
      return { success: false, errorCode: resolved.errorCode, errorMessage: resolved.errorMessage };
    }

    try {
      const credentials = parseTwilioSmsCredentials(resolved.plaintext);
      if (this.useLiveProviders) {
        return this.live.send(request, credentials);
      }
      return this.simulated.send(request);
    } catch (error) {
      return {
        success: false,
        errorCode: 'unauthorized',
        errorMessage: error instanceof Error ? error.message : 'Invalid SMS credentials.',
      };
    }
  }
}
