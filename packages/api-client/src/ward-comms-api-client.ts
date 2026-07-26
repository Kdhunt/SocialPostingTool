import { healthResponseSchema, type HealthResponse } from '@ward-comms/validation';

export interface WardCommsApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Thin typed HTTP client for apps/api, consumed by apps/web and apps/mobile.
 * Provider- and domain-specific endpoints are added as those features ship;
 * Phase 2 only wires up the health check so the client boundary exists end
 * to end.
 */
export class WardCommsApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WardCommsApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getHealth(): Promise<HealthResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/health`);

    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }

    const body: unknown = await response.json();
    return healthResponseSchema.parse(body);
  }
}
