import { healthResponseSchema, type HealthResponse } from '@ward-comms/validation';
import {
  loginResponseSchema,
  mobileTokenPairSchema,
  sessionResponseSchema,
  wardCodeVerifyResponseSchema,
  type LoginResponse,
  type MobileTokenPair,
  type SessionResponse,
  type WardCodeVerifyResponse,
} from '@ward-comms/validation';

export interface WardCommsApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Bearer access token for mobile clients. Ignored by web (which relies on the HTTP-only session cookie). */
  getAccessToken?: () => string | null;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Thin typed HTTP client for apps/api, consumed by apps/web and
 * apps/mobile. Every request that needs the web session cookie sent uses
 * `credentials: 'include'`; mobile clients instead pass an access token
 * via `getAccessToken`. This client never persists tokens itself — that is
 * the calling app's responsibility (HTTP-only cookie for web; secure
 * device storage for mobile — see AGENTS.md: "do not use localStorage for
 * browser authentication tokens").
 */
export class WardCommsApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken?: () => string | null;

  constructor(options: WardCommsApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.getAccessToken = options.getAccessToken;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const accessToken = this.getAccessToken?.();
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const message =
        typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
          ? body.message
          : `Request failed with status ${response.status}`;
      throw new ApiRequestError(message, response.status);
    }

    return response;
  }

  async getHealth(): Promise<HealthResponse> {
    const response = await this.request('/health');
    return healthResponseSchema.parse(await response.json());
  }

  async login(username: string, password: string, clientType: 'web' | 'mobile' = 'web'): Promise<LoginResponse> {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, clientType }),
    });
    return loginResponseSchema.parse(await response.json());
  }

  async verifyWardCode(
    loginTicket: string,
    wardCode: string,
    clientType: 'web' | 'mobile' = 'web',
  ): Promise<WardCodeVerifyResponse> {
    const response = await this.request('/auth/ward-code', {
      method: 'POST',
      body: JSON.stringify({ loginTicket, wardCode, clientType }),
    });
    return wardCodeVerifyResponseSchema.parse(await response.json());
  }

  async refresh(refreshToken: string): Promise<{ tokens: MobileTokenPair }> {
    const response = await this.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    const body = (await response.json()) as { tokens: unknown };
    return { tokens: mobileTokenPairSchema.parse(body.tokens) };
  }

  async getSession(): Promise<SessionResponse> {
    const response = await this.request('/auth/session');
    return sessionResponseSchema.parse(await response.json());
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST' });
  }
}
