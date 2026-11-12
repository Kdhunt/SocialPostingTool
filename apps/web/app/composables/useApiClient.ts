import { navigateTo, useRoute, useRuntimeConfig } from '#imports';
import { WardCommsApiClient } from '@ward-comms/api-client';
import { useAuth } from '~/composables/useAuth';

/**
 * Builds a `WardCommsApiClient` pointed at the configured API base URL.
 * Web relies solely on the HTTP-only session cookie (see useAuth.ts) —
 * this client never needs `getAccessToken`.
 *
 * Because pages no longer re-check the session on every visit, a 401 from
 * a data endpoint is how an expired session is noticed: the user is sent to
 * sign in. `/auth/*` endpoints are excluded, since they answer 401 for a
 * wrong current password or authenticator code too.
 */
export function useApiClient(): WardCommsApiClient {
  const config = useRuntimeConfig();
  const { markSignedOut } = useAuth();
  const route = useRoute();

  async function fetchWithSessionCheck(input: string | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    const path = new URL(String(input), 'http://placeholder').pathname;
    if (response.status === 401 && !/\/auth\//.test(path) && import.meta.client) {
      markSignedOut();
      void navigateTo({ path: '/login', query: { redirect: route.fullPath } });
    }
    return response;
  }

  return new WardCommsApiClient({ baseUrl: config.public.apiBaseUrl, fetchImpl: fetchWithSessionCheck });
}
