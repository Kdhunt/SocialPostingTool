import { WardCommsApiClient } from '@ward-comms/api-client';

/**
 * Signs in through the real API as a mobile client and returns a typed
 * client that sends the resulting bearer token. Used only to build the mock
 * ward; browser tests sign in through the web UI or the cookie endpoint.
 */
export async function signedInClient(
  apiUrl: string,
  credentials: { username: string; password: string; unitCode?: string },
): Promise<WardCommsApiClient> {
  const anonymous = new WardCommsApiClient({ baseUrl: apiUrl });
  const result = await anonymous.login(
    credentials.username,
    credentials.password,
    'mobile',
    credentials.unitCode,
  );
  if (result.status !== 'ok') {
    throw new Error(
      `Mock-ward sign-in for ${credentials.username} needs an extra step (${result.status}).`,
    );
  }
  const token = result.tokens?.accessToken;
  if (!token) {
    throw new Error(`Mock-ward sign-in for ${credentials.username} returned no access token.`);
  }
  return new WardCommsApiClient({ baseUrl: apiUrl, getAccessToken: () => token });
}

export async function waitForApi(apiUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API at ${apiUrl} did not become healthy: ${String(lastError)}`);
}
