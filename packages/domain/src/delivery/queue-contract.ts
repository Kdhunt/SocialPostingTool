export const DELIVERY_QUEUE_NAME = 'ward-comms-delivery';

/** Transactional / account email outbox (verification, password reset). */
export const OUTBOUND_QUEUE_NAME = 'ward-comms-outbound';

export interface OutboundJobData {
  outboundMessageId: string;
}

export type OutboundJobOutcome = 'sent' | 'retry_scheduled' | 'failed' | 'already_terminal';

export interface OutboundJobResult {
  outcome: OutboundJobOutcome;
}

export interface DeliveryJobData {
  deliveryRecipientId: string;
}

export type DeliveryJobOutcome = 'sent' | 'retry_scheduled' | 'dead_lettered';

export interface DeliveryJobResult {
  outcome: DeliveryJobOutcome;
}
