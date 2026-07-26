import { useRuntimeConfig } from '#imports';
import { WardCommsApiClient } from '@ward-comms/api-client';

/**
 * Builds a `WardCommsApiClient` pointed at the configured API base URL.
 * Web relies solely on the HTTP-only session cookie (see useAuth.ts) —
 * this client never needs `getAccessToken`.
 */
export function useApiClient(): WardCommsApiClient {
  const config = useRuntimeConfig();
  return new WardCommsApiClient({ baseUrl: config.public.apiBaseUrl });
}
