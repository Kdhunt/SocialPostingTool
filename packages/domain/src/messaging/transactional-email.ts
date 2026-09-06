import type { ProviderSendResult } from '../delivery/provider-adapter.js';

/**
 * Platform (non-campaign) email. Used for account verification and
 * password reset. Provider SDKs stay in app adapters — this package only
 * defines the port.
 */
export interface TransactionalEmailRequest {
  toAddress: string;
  subject: string;
  body: string;
  idempotencyKey: string;
}

export interface TransactionalEmailAdapter {
  send(request: TransactionalEmailRequest): Promise<ProviderSendResult>;
}

export const OUTBOUND_MESSAGE_KINDS = ['EmailVerification', 'PasswordReset'] as const;
export type OutboundMessageKind = (typeof OUTBOUND_MESSAGE_KINDS)[number];

export const OUTBOUND_MESSAGE_STATUSES = ['Pending', 'Sending', 'Sent', 'Failed'] as const;
export type OutboundMessageStatus = (typeof OUTBOUND_MESSAGE_STATUSES)[number];

export function computeOutboundIdempotencyKey(input: {
  kind: OutboundMessageKind;
  userId: string;
  tokenId: string;
}): string {
  return `account-email:${input.kind}:${input.userId}:${input.tokenId}`;
}
