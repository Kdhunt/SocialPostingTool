import type { CommunicationChannel } from '@ward-comms/domain';

export interface StoredProviderCredential {
  channel: CommunicationChannel;
  providerAccountReference: string;
  encryptedPayload: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ProviderCredentialLookup {
  findActive(
    wardId: string,
    channel: CommunicationChannel,
    providerAccountReference: string,
  ): Promise<StoredProviderCredential | null>;
}

export interface DecryptedEmailCredentials {
  apiKey: string;
  fromAddress: string;
}

export interface DecryptedSmsCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface DecryptedFacebookPageCredentials {
  pageAccessToken: string;
  pageId: string;
}
