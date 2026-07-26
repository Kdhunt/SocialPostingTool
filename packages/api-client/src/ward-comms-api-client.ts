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
import {
  householdDetailSchema,
  householdListResponseSchema,
  personDetailSchema,
  personListResponseSchema,
  type AddHouseholdMembershipRequest,
  type CreateContactMethodRequest,
  type CreateHouseholdRequest,
  type CreatePersonRequest,
  type CreateRelationshipRequest,
  type HouseholdDetailDto,
  type HouseholdListResponse,
  type PersonDetailDto,
  type PersonListResponse,
  type PersonSearchQuery,
  type UpdateConsentRequest,
  type UpdateContactMethodRequest,
  type UpdateHouseholdRequest,
  type UpdatePersonRequest,
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

  // --- Directory: people -----------------------------------------------------

  async searchPeople(query: PersonSearchQuery = {}): Promise<PersonListResponse> {
    const params = new URLSearchParams();
    if (query.query) params.set('query', query.query);
    if (query.includeInactive !== undefined) params.set('includeInactive', String(query.includeInactive));
    if (query.householdId) params.set('householdId', query.householdId);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const search = params.toString();
    const response = await this.request(`/directory/people${search ? `?${search}` : ''}`);
    return personListResponseSchema.parse(await response.json());
  }

  async getPerson(id: string): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${id}`);
    return personDetailSchema.parse(await response.json());
  }

  async createPerson(input: CreatePersonRequest): Promise<PersonDetailDto> {
    const response = await this.request('/directory/people', { method: 'POST', body: JSON.stringify(input) });
    return personDetailSchema.parse(await response.json());
  }

  async updatePerson(id: string, input: UpdatePersonRequest): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    return personDetailSchema.parse(await response.json());
  }

  async archivePerson(id: string): Promise<void> {
    await this.request(`/directory/people/${id}/archive`, { method: 'POST' });
  }

  async restorePerson(id: string): Promise<void> {
    await this.request(`/directory/people/${id}/restore`, { method: 'POST' });
  }

  async addContactMethod(personId: string, input: CreateContactMethodRequest): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${personId}/contact-methods`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return personDetailSchema.parse(await response.json());
  }

  async updateContactMethod(
    personId: string,
    contactMethodId: string,
    input: UpdateContactMethodRequest,
  ): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${personId}/contact-methods/${contactMethodId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return personDetailSchema.parse(await response.json());
  }

  async archiveContactMethod(personId: string, contactMethodId: string): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${personId}/contact-methods/${contactMethodId}`, {
      method: 'DELETE',
    });
    return personDetailSchema.parse(await response.json());
  }

  async setConsent(personId: string, contactMethodId: string, input: UpdateConsentRequest): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${personId}/contact-methods/${contactMethodId}/consent`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return personDetailSchema.parse(await response.json());
  }

  async addRelationship(personId: string, input: CreateRelationshipRequest): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${personId}/relationships`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return personDetailSchema.parse(await response.json());
  }

  async archiveRelationship(personId: string, relationshipId: string): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${personId}/relationships/${relationshipId}`, {
      method: 'DELETE',
    });
    return personDetailSchema.parse(await response.json());
  }

  async addHouseholdMembership(personId: string, input: AddHouseholdMembershipRequest): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${personId}/household-memberships`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return personDetailSchema.parse(await response.json());
  }

  async endHouseholdMembership(personId: string, membershipId: string): Promise<PersonDetailDto> {
    const response = await this.request(`/directory/people/${personId}/household-memberships/${membershipId}`, {
      method: 'DELETE',
    });
    return personDetailSchema.parse(await response.json());
  }

  // --- Directory: households ---------------------------------------------------

  async listHouseholds(includeInactive = false): Promise<HouseholdListResponse> {
    const response = await this.request(`/directory/households?includeInactive=${String(includeInactive)}`);
    return householdListResponseSchema.parse(await response.json());
  }

  async getHousehold(id: string): Promise<HouseholdDetailDto> {
    const response = await this.request(`/directory/households/${id}`);
    return householdDetailSchema.parse(await response.json());
  }

  async createHousehold(input: CreateHouseholdRequest): Promise<HouseholdDetailDto> {
    const response = await this.request('/directory/households', { method: 'POST', body: JSON.stringify(input) });
    return householdDetailSchema.parse(await response.json());
  }

  async updateHousehold(id: string, input: UpdateHouseholdRequest): Promise<HouseholdDetailDto> {
    const response = await this.request(`/directory/households/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return householdDetailSchema.parse(await response.json());
  }

  async archiveHousehold(id: string): Promise<void> {
    await this.request(`/directory/households/${id}/archive`, { method: 'POST' });
  }
}
