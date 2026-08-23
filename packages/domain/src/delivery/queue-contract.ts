export const DELIVERY_QUEUE_NAME = 'ward-comms-delivery';

export interface DeliveryJobData {
  deliveryRecipientId: string;
}

export type DeliveryJobOutcome = 'sent' | 'retry_scheduled' | 'dead_lettered';

export interface DeliveryJobResult {
  outcome: DeliveryJobOutcome;
}
