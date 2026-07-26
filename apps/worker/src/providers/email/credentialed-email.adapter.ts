import type { PrismaClient } from '@ward-comms/database';
import type { EmailProviderAdapter, EmailSendRequest, ProviderSendResult } from '@ward-comms/domain';
import { resolveCredentialPlaintext } from '../credentials/resolve-credentials.js';
import type { ProviderCredentialLookup } from '../credentials/types.js';
import { LiveEmailProviderAdapter, parseLiveEmailCredentials } from './live-email.adapter.js';
import { SimulatedEmailProviderAdapter } from './simulated-email.adapter.js';

/**
 * Credential-gated email adapter. Loads encrypted credentials for the
 * destination's providerAccountReference, refuses expired/missing
 * credentials with permanent error codes, then delegates to simulated
 * (credentialed mode) or live SendGrid/SMTP (live mode).
 */
export class CredentialedEmailProviderAdapter implements EmailProviderAdapter {
  private readonly simulated = new SimulatedEmailProviderAdapter();
  private readonly live = new LiveEmailProviderAdapter();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly lookup: ProviderCredentialLookup,
    private readonly encryptionKey: string,
    private readonly useLiveProviders: boolean,
  ) {}

  async send(request: EmailSendRequest): Promise<ProviderSendResult> {
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
      'Email',
      destination.providerAccountReference,
    );
    if (!resolved.ok) {
      return { success: false, errorCode: resolved.errorCode, errorMessage: resolved.errorMessage };
    }

    try {
      const credentials = parseLiveEmailCredentials(resolved.plaintext);
      if (this.useLiveProviders) {
        return this.live.send(request, credentials);
      }
      return this.simulated.send(request);
    } catch (error) {
      return {
        success: false,
        errorCode: 'unauthorized',
        errorMessage: error instanceof Error ? error.message : 'Invalid email credentials.',
      };
    }
  }
}
