import type { PrismaClient } from '@ward-comms/database';
import type { ProviderSendResult, SmsProviderAdapter, SmsSendRequest } from '@ward-comms/domain';
import { parseSmsCredentials, resolveCredentialPlaintext } from '../credentials/resolve-credentials.js';
import type { ProviderCredentialLookup } from '../credentials/types.js';
import { SimulatedSmsProviderAdapter } from './simulated-sms.adapter.js';

export class CredentialedSmsProviderAdapter implements SmsProviderAdapter {
  private readonly inner = new SimulatedSmsProviderAdapter();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly lookup: ProviderCredentialLookup,
    private readonly encryptionKey: string,
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

    parseSmsCredentials(resolved.plaintext);
    return this.inner.send(request);
  }
}
