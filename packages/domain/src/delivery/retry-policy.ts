export const MAX_DELIVERY_ATTEMPTS = 5;

export type DeliveryFailureKind = 'transient' | 'permanent';

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30 * 60 * 1000;

export function computeRetryDelayMs(failedAttemptNumber: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** (failedAttemptNumber - 1), MAX_DELAY_MS);
}

export interface RetryDecisionInput {
  attemptNumber: number;
  failureKind: DeliveryFailureKind;
}

export interface RetryDecision {
  shouldRetry: boolean;
  isDeadLetter: boolean;
  delayMs: number | null;
}

export function decideRetry(input: RetryDecisionInput): RetryDecision {
  if (input.failureKind === 'permanent') {
    return { shouldRetry: false, isDeadLetter: true, delayMs: null };
  }
  if (input.attemptNumber >= MAX_DELIVERY_ATTEMPTS) {
    return { shouldRetry: false, isDeadLetter: true, delayMs: null };
  }
  return { shouldRetry: true, isDeadLetter: false, delayMs: computeRetryDelayMs(input.attemptNumber) };
}

export function classifyDeliveryErrorCode(errorCode: string): DeliveryFailureKind {
  const permanentCodes = new Set([
    'invalid_recipient',
    'invalid_destination',
    'content_rejected',
    'unauthorized',
    'unsubscribed',
    'credentials_expired',
  ]);
  return permanentCodes.has(errorCode) ? 'permanent' : 'transient';
}
