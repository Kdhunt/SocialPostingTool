import type { PrismaClient } from '@ward-comms/database';
import type { EmailProviderAdapter, EmailSendRequest, ProviderSendResult } from '@ward-comms/domain';
import { parseEmailCredentials, resolveCredentialPlaintext } from '../credentials/resolve-credentials.js';
import type { ProviderCredentialLookup } from '../credentials/types.js';
import { SimulatedEmailProviderAdapter } from './simulated-email.adapter.js';

/**
 * Credential-gated email adapter. Loads encrypted credentials for the
 * destination's providerAccountReference, refuses expired/missing
 * credentials with permanent error codes, then delegates the actual send
 * to the simulated (dev) or future SDK-backed inner adapter. No provider
 * SDK is imported here — Phase 9 keeps SDKs out of domain and behind this
 * adapter boundary.
 */
export class CredentialedEmailProviderAdapter implements EmailProviderAdapter {
  private readonly inner = new SimulatedEmailProviderAdapter();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly lookup: ProviderCredentialLookup,
    private readonly encryptionKey: string,
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

    // Touch parsed credentials so misconfigured JSON fails closed before send.
    parseEmailCredentials(resolved.plaintext);
    return this.inner.send(request);
  }
}
