import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, WardCommsApiClient } from './ward-comms-api-client.js';

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

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3001/health',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(health.status).toBe('ok');
  });

  it('throws an ApiRequestError with the response status when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    await expect(client.getHealth()).rejects.toThrow(ApiRequestError);
    await expect(client.getHealth()).rejects.toMatchObject({ status: 500 });
  });

  it('sends a Bearer token from getAccessToken when provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"user":{}}', { status: 200 }));
    const client = new WardCommsApiClient({
      baseUrl: 'http://localhost:3001',
      fetchImpl,
      getAccessToken: () => 'fictional-access-token',
    });

    await client.logout();

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer fictional-access-token');
  });

  it('sends login credentials with the expected shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ward_code_required', loginTicket: 'ticket-abc' }), { status: 200 }),
    );
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    const result = await client.login('jane.doe', 'Fictional-Password-42');

    expect(result).toEqual({ status: 'ward_code_required', loginTicket: 'ticket-abc' });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'jane.doe',
      password: 'Fictional-Password-42',
      clientType: 'web',
    });
  });

  it('builds a directory search query string only from provided fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ people: [] }), { status: 200 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    await client.searchPeople({ query: 'Doe', includeInactive: true });

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3001/directory/people?query=Doe&includeInactive=true');
  });

  it('creates a person with the given payload', async () => {
    const person = {
      id: 'p1',
      firstName: 'Jane',
      lastName: 'Doe',
      preferredName: null,
      gender: 'Female',
      dateOfBirth: null,
      isMinor: false,
      isActive: true,
      restricted: false,
      contactMethods: [],
      householdMemberships: [],
      relationships: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(person), { status: 200 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    const result = await client.createPerson({ firstName: 'Jane', lastName: 'Doe' });

    expect(result.id).toBe('p1');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/directory/people');
    expect(init.method).toBe('POST');
  });
});
