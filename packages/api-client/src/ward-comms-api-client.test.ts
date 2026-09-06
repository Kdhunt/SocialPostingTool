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

  it('builds an audience search query string only from provided fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ audiences: [] }), { status: 200 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    await client.searchAudiences({ query: 'Youth', includeArchived: true });

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3001/audiences?query=Youth&includeArchived=true');
  });

  it('creates an audience group with the given payload', async () => {
    const group = {
      id: 'ag1',
      name: 'Whatever the ward calls it',
      description: null,
      isActive: true,
      members: [],
      destinations: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(group), { status: 200 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    const result = await client.createAudience({ name: 'Whatever the ward calls it' });

    expect(result.id).toBe('ag1');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/audiences');
    expect(init.method).toBe('POST');
  });

  it('posts a preview request with the given audience group ids', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ totalCount: 0, overlapCount: 0, members: [] }), { status: 200 }),
    );
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    await client.previewAudiences(['a1', 'a2']);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/audiences/preview');
    expect(JSON.parse(init.body as string)).toEqual({ audienceGroupIds: ['a1', 'a2'] });
  });

  it('builds a campaign search query string only from provided fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ campaigns: [] }), { status: 200 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    await client.searchCampaigns({ query: 'Fall', status: 'Draft' });

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3001/campaigns?query=Fall&status=Draft');
  });

  it('creates a campaign with the given payload', async () => {
    const campaign = {
      id: 'c1',
      name: 'Fictional Campaign',
      status: 'Draft',
      isActive: true,
      currentVersion: {
        id: 'cv1',
        versionNumber: 1,
        baseMessage: 'Hello ward!',
        baseImageAssetId: null,
        channelVersions: [],
        audiences: [],
        destinations: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      approvals: [],
      schedules: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(campaign), { status: 200 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    const result = await client.createCampaign({ name: 'Fictional Campaign', baseMessage: 'Hello ward!' });

    expect(result.id).toBe('c1');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/campaigns');
    expect(init.method).toBe('POST');
  });

  it('posts an approval decision with an optional comment', async () => {
    const campaign = {
      id: 'c1',
      name: 'Fictional Campaign',
      status: 'Approved',
      isActive: true,
      currentVersion: {
        id: 'cv1',
        versionNumber: 1,
        baseMessage: 'Hello ward!',
        baseImageAssetId: null,
        channelVersions: [],
        audiences: [],
        destinations: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      approvals: [],
      schedules: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(campaign), { status: 200 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    await client.approveCampaign('c1', 'Looks good');

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/campaigns/c1/approve');
    expect(JSON.parse(init.body as string)).toEqual({ comment: 'Looks good' });
  });

  it('rotates a ward code and resets a ward admin password through platform routes', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: 2, activatedAt: null, createdAt: '2026-01-01T00:00:00.000Z' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    const rotated = await client.rotateWardCodeForWard('ward-1', 'fictional-new-code');
    expect(rotated.version).toBe(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:3001/platform/wards/ward-1/code/rotate');

    await client.resetWardAdminPassword('ward-1', 'user-1', 'Fictional-Reset-42');
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'http://localhost:3001/platform/wards/ward-1/admins/user-1/password',
    );
  });

  it('resets a same-ward user password', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    await client.resetUserPassword('user-1', 'Fictional-Reset-42');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3001/users/user-1/password',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('updates the signed-in user email and password through auth routes', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            email: 'new.member@example.com',
            emailVerifiedAt: null,
            message: 'Email updated. Confirm the new address from the message we queued.',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    const changed = await client.changeOwnEmail({ email: '  New.Member@Example.COM  ' });
    expect(changed.email).toBe('new.member@example.com');
    expect(changed.emailVerifiedAt).toBeNull();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:3001/auth/email');

    await client.changeOwnPassword({
      currentPassword: 'Fictional-Password-42',
      newPassword: 'Fictional-Reset-99x',
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('http://localhost:3001/auth/change-password');

    await client.resendOwnVerificationEmail();
    expect(fetchImpl.mock.calls[2]?.[0]).toBe('http://localhost:3001/auth/verification-email');
  });

  it('updates a same-ward user email through the admin route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'user-1',
          username: 'ward.member',
          email: 'updated.member@example.com',
          emailVerifiedAt: null,
          displayName: 'Fictional Member',
          disabledAt: null,
          lastLoginAt: null,
          roleIds: [],
          roleNames: [],
        }),
        { status: 200 },
      ),
    );
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });

    const updated = await client.updateUserEmail('user-1', { email: 'updated.member@example.com' });
    expect(updated.email).toBe('updated.member@example.com');
    expect(updated.emailVerifiedAt).toBeNull();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:3001/users/user-1/email');
  });

  it('requests a password reset email without leaking account existence', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'If an account exists for that email, we sent a message with next steps.' }), {
        status: 200,
      }),
    );
    const client = new WardCommsApiClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const result = await client.requestPasswordReset('member@example.com');
    expect(result.message).toContain('If an account exists');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:3001/auth/forgot-password');
  });
});
