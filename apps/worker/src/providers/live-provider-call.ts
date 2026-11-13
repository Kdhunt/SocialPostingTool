import type { ProviderSendFailure } from '@ward-comms/domain';

/**
 * Longest a single live provider call may take. A hung provider would otherwise hold the serverless function
 * until the platform kills it, leaving the recipient claimed ("Sending") and never retried. Both outcomes below
 * are transient, so the retry policy picks them up.
 */
export const LIVE_PROVIDER_TIMEOUT_MS = 10_000;

export interface LiveSendOptions {
  /** Overrides {@link LIVE_PROVIDER_TIMEOUT_MS}. Tests use a short value. */
  timeoutMs?: number;
}

/**
 * `fetch` for live providers: never throws. A timeout becomes `timeout`; a network failure (DNS, refused,
 * reset) becomes `provider_unavailable`. Messages are generic so request URLs (which can carry tokens) never
 * reach delivery records or logs.
 */
export async function fetchProvider(
  providerName: string,
  url: string,
  init: RequestInit,
  options: LiveSendOptions = {},
): Promise<Response | ProviderSendFailure> {
  const timeoutMs = options.timeoutMs ?? LIVE_PROVIDER_TIMEOUT_MS;
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return providerUnreachable(providerName, error, timeoutMs);
  }
}

export function isProviderFailure(value: Response | ProviderSendFailure): value is ProviderSendFailure {
  return (value as { success?: unknown }).success === false;
}

export function providerTimedOut(providerName: string, timeoutMs: number): ProviderSendFailure {
  return {
    success: false,
    errorCode: 'timeout',
    errorMessage: `${providerName} did not respond within ${Math.round(timeoutMs / 1000)} seconds.`,
  };
}

export function providerUnreachable(providerName: string, error: unknown, timeoutMs: number): ProviderSendFailure {
  if (isTimeoutError(error)) {
    return providerTimedOut(providerName, timeoutMs);
  }
  const code = systemErrorCode(error);
  return {
    success: false,
    errorCode: 'provider_unavailable',
    errorMessage: `${providerName} could not be reached${code ? ` (${code})` : ''}.`,
  };
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  const code = systemErrorCode(error);
  return code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT';
}

/** A Node/undici error code such as ECONNREFUSED, taken from the error or its cause. Never free text. */
function systemErrorCode(error: unknown): string | null {
  const candidates = [error, error instanceof Error ? error.cause : undefined];
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown } | undefined)?.code;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(code)) {
      return code;
    }
  }
  return null;
}
