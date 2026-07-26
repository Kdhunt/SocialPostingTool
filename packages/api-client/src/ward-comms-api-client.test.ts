import { describe, expect, it, vi } from 'vitest';
import { WardCommsApiClient } from './ward-comms-api-client.js';

describe('WardCommsApiClient', () => {
  it('parses a valid health response', async () => {
    const timestamp = new Date().toISOString();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', service: '@ward-comms/api', timestamp }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001/', fetchImpl });
    const health = await client.getHealth();

    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3001/health');
    expect(health.status).toBe('ok');
  });

  it('throws when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    await expect(client.getHealth()).rejects.toThrow('Health check failed');
  });
});
