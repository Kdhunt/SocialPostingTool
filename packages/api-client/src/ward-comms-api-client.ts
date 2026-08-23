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
import {
  audienceGroupDetailSchema,
  audienceListResponseSchema,
  audiencePreviewResponseSchema,
  communicationDestinationSchema,
  destinationListResponseSchema,
  type AddAudienceDestinationRequest,
  type AddAudienceMemberRequest,
  type AudienceGroupDetailDto,
  type AudienceListResponse,
  type AudiencePreviewResponse,
  type AudienceSearchQuery,
  type CommunicationDestinationDto,
  type CreateAudienceGroupRequest,
  type CreateCommunicationDestinationRequest,
  type DestinationListResponse,
  type UpdateAudienceGroupRequest,
  type SetAudienceRulesRequest,
  type AudienceRulesPreviewResponse,
  type AudienceRulesApplyResponse,
} from '@ward-comms/validation';
import {
  audienceRulesApplyResponseSchema,
  audienceRulesPreviewResponseSchema,
  campaignAssetSchema,
  campaignDetailSchema,
  campaignListResponseSchema,
  campaignPreviewResponseSchema,
  campaignValidationResponseSchema,
  type AddCampaignAudienceRequest,
  type CampaignDetailDto,
  type CampaignAssetDto,
  type CampaignListResponse,
  type CampaignPreviewResponse,
  type CampaignSearchQuery,
  type CampaignValidationResponse,
  type CreateCampaignAssetRequest,
  type CreateCampaignRequest,
  type GenerateCampaignImageRequest,
  type SetCampaignChannelTextRequest,
  type SetOverlapResolutionRequest,
  type UpdateCampaignAudienceRequest,
  type UpdateCampaignRequest,
  type UpdateCampaignVersionRequest,
} from '@ward-comms/validation';
import {
  deliveryBatchDetailSchema,
  deliveryBatchListResponseSchema,
  type DeliveryBatchDetailDto,
  type DeliveryBatchListResponse,
} from '@ward-comms/validation';
import {
  auditListResponseSchema,
  roleListResponseSchema,
  userListResponseSchema,
  userSummarySchema,
  wardCodeInfoSchema,
  createUserRequestSchema,
  type AuditListResponse,
  type AuditSearchQuery,
  type CreateUserRequest,
  type RoleListResponse,
  type UserListResponse,
  type UserSummaryDto,
  type WardCodeInfoDto,
} from '@ward-comms/validation';
import {
  providerCredentialListResponseSchema,
  providerCredentialSummarySchema,
  upsertProviderCredentialRequestSchema,
  type ProviderCredentialListResponse,
  type ProviderCredentialSummaryDto,
  type UpsertProviderCredentialRequest,
} from '@ward-comms/validation';
import type { CommunicationChannel } from '@ward-comms/validation';

export type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface WardCommsApiClientOptions {
  baseUrl: string;
  fetchImpl?: FetchImpl;
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
/** Browser fetch must keep its receiver; assigning `fetch` to a field and calling it later throws "Illegal invocation". */
function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

export class WardCommsApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;
  private readonly getAccessToken?: () => string | null;

  constructor(options: WardCommsApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
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

  // --- Admin: users & ward -----------------------------------------------------

  async listUsers(): Promise<UserListResponse> {
    const response = await this.request('/users');
    return userListResponseSchema.parse(await response.json());
  }

  async listRoles(): Promise<RoleListResponse> {
    const response = await this.request('/users/roles');
    return roleListResponseSchema.parse(await response.json());
  }

  async createUser(input: CreateUserRequest): Promise<UserSummaryDto> {
    const response = await this.request('/users', {
      method: 'POST',
      body: JSON.stringify(createUserRequestSchema.parse(input)),
    });
    return userSummarySchema.parse(await response.json());
  }

  async assignUserRoles(userId: string, roleIds: string[]): Promise<UserSummaryDto> {
    const response = await this.request(`/users/${userId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    });
    return userSummarySchema.parse(await response.json());
  }

  async disableUser(userId: string): Promise<void> {
    await this.request(`/auth/users/${userId}/disable`, { method: 'POST' });
  }

  async enableUser(userId: string): Promise<void> {
    await this.request(`/auth/users/${userId}/enable`, { method: 'POST' });
  }

  async getWardCodeInfo(): Promise<WardCodeInfoDto | null> {
    const response = await this.request('/ward/code');
    const body: unknown = await response.json();
    if (body === null) return null;
    return wardCodeInfoSchema.parse(body);
  }

  async rotateWardCode(newWardCode: string): Promise<WardCodeInfoDto> {
    const response = await this.request('/ward/code/rotate', {
      method: 'POST',
      body: JSON.stringify({ newWardCode }),
    });
    return wardCodeInfoSchema.parse(await response.json());
  }

  async listAuditEvents(query: AuditSearchQuery = {}): Promise<AuditListResponse> {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.action) params.set('action', query.action);
    if (query.entityType) params.set('entityType', query.entityType);
    const search = params.toString();
    const response = await this.request(`/audit${search ? `?${search}` : ''}`);
    return auditListResponseSchema.parse(await response.json());
  }

  async listProviderCredentials(): Promise<ProviderCredentialListResponse> {
    const response = await this.request('/provider-credentials');
    return providerCredentialListResponseSchema.parse(await response.json());
  }

  async upsertProviderCredential(input: UpsertProviderCredentialRequest): Promise<ProviderCredentialSummaryDto> {
    const response = await this.request('/provider-credentials', {
      method: 'POST',
      body: JSON.stringify(upsertProviderCredentialRequestSchema.parse(input)),
    });
    return providerCredentialSummarySchema.parse(await response.json());
  }

  async revokeProviderCredential(id: string): Promise<void> {
    await this.request(`/provider-credentials/${id}/revoke`, { method: 'POST' });
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

  // --- Audiences -----------------------------------------------------------------

  async searchAudiences(query: AudienceSearchQuery = {}): Promise<AudienceListResponse> {
    const params = new URLSearchParams();
    if (query.query) params.set('query', query.query);
    if (query.includeArchived !== undefined) params.set('includeArchived', String(query.includeArchived));
    const search = params.toString();
    const response = await this.request(`/audiences${search ? `?${search}` : ''}`);
    return audienceListResponseSchema.parse(await response.json());
  }

  async getAudience(id: string): Promise<AudienceGroupDetailDto> {
    const response = await this.request(`/audiences/${id}`);
    return audienceGroupDetailSchema.parse(await response.json());
  }

  async createAudience(input: CreateAudienceGroupRequest): Promise<AudienceGroupDetailDto> {
    const response = await this.request('/audiences', { method: 'POST', body: JSON.stringify(input) });
    return audienceGroupDetailSchema.parse(await response.json());
  }

  async updateAudience(id: string, input: UpdateAudienceGroupRequest): Promise<AudienceGroupDetailDto> {
    const response = await this.request(`/audiences/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    return audienceGroupDetailSchema.parse(await response.json());
  }

  async archiveAudience(id: string): Promise<void> {
    await this.request(`/audiences/${id}/archive`, { method: 'POST' });
  }

  async restoreAudience(id: string): Promise<void> {
    await this.request(`/audiences/${id}/restore`, { method: 'POST' });
  }

  async deleteAudience(id: string): Promise<void> {
    await this.request(`/audiences/${id}`, { method: 'DELETE' });
  }

  async addAudienceMember(id: string, input: AddAudienceMemberRequest): Promise<AudienceGroupDetailDto> {
    const response = await this.request(`/audiences/${id}/members`, { method: 'POST', body: JSON.stringify(input) });
    return audienceGroupDetailSchema.parse(await response.json());
  }

  async removeAudienceMember(id: string, personId: string): Promise<AudienceGroupDetailDto> {
    const response = await this.request(`/audiences/${id}/members/${personId}`, { method: 'DELETE' });
    return audienceGroupDetailSchema.parse(await response.json());
  }

  async setAudienceRules(id: string, input: SetAudienceRulesRequest): Promise<AudienceGroupDetailDto> {
    const response = await this.request(`/audiences/${id}/rules`, { method: 'PUT', body: JSON.stringify(input) });
    return audienceGroupDetailSchema.parse(await response.json());
  }

  async previewAudienceRules(id: string): Promise<AudienceRulesPreviewResponse> {
    const response = await this.request(`/audiences/${id}/rules/preview`);
    return audienceRulesPreviewResponseSchema.parse(await response.json());
  }

  async applyAudienceRules(id: string): Promise<AudienceRulesApplyResponse> {
    const response = await this.request(`/audiences/${id}/rules/apply`, { method: 'POST' });
    return audienceRulesApplyResponseSchema.parse(await response.json());
  }

  async addAudienceDestination(id: string, input: AddAudienceDestinationRequest): Promise<AudienceGroupDetailDto> {
    const response = await this.request(`/audiences/${id}/destinations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return audienceGroupDetailSchema.parse(await response.json());
  }

  async removeAudienceDestination(id: string, destinationId: string): Promise<AudienceGroupDetailDto> {
    const response = await this.request(`/audiences/${id}/destinations/${destinationId}`, { method: 'DELETE' });
    return audienceGroupDetailSchema.parse(await response.json());
  }

  async previewAudiences(audienceGroupIds: string[]): Promise<AudiencePreviewResponse> {
    const response = await this.request('/audiences/preview', {
      method: 'POST',
      body: JSON.stringify({ audienceGroupIds }),
    });
    return audiencePreviewResponseSchema.parse(await response.json());
  }

  // --- Communication destinations --------------------------------------------------

  async listDestinations(includeArchived = false): Promise<DestinationListResponse> {
    const response = await this.request(`/communication-destinations?includeArchived=${String(includeArchived)}`);
    return destinationListResponseSchema.parse(await response.json());
  }

  async createDestination(input: CreateCommunicationDestinationRequest): Promise<CommunicationDestinationDto> {
    const response = await this.request('/communication-destinations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return communicationDestinationSchema.parse(await response.json());
  }

  async archiveDestination(id: string): Promise<void> {
    await this.request(`/communication-destinations/${id}/archive`, { method: 'POST' });
  }

  // --- Campaigns -----------------------------------------------------------------

  async searchCampaigns(query: CampaignSearchQuery = {}): Promise<CampaignListResponse> {
    const params = new URLSearchParams();
    if (query.query) params.set('query', query.query);
    if (query.status) params.set('status', query.status);
    if (query.includeArchived !== undefined) params.set('includeArchived', String(query.includeArchived));
    const search = params.toString();
    const response = await this.request(`/campaigns${search ? `?${search}` : ''}`);
    return campaignListResponseSchema.parse(await response.json());
  }

  async getCampaign(id: string): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}`);
    return campaignDetailSchema.parse(await response.json());
  }

  async previewCampaign(id: string): Promise<CampaignPreviewResponse> {
    const response = await this.request(`/campaigns/${id}/preview`);
    return campaignPreviewResponseSchema.parse(await response.json());
  }

  async validateCampaign(id: string): Promise<CampaignValidationResponse> {
    const response = await this.request(`/campaigns/${id}/validation`);
    return campaignValidationResponseSchema.parse(await response.json());
  }

  async createCampaign(input: CreateCampaignRequest): Promise<CampaignDetailDto> {
    const response = await this.request('/campaigns', { method: 'POST', body: JSON.stringify(input) });
    return campaignDetailSchema.parse(await response.json());
  }

  async updateCampaignName(id: string, input: UpdateCampaignRequest): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    return campaignDetailSchema.parse(await response.json());
  }

  async archiveCampaign(id: string): Promise<void> {
    await this.request(`/campaigns/${id}/archive`, { method: 'POST' });
  }

  async updateCampaignContent(id: string, input: UpdateCampaignVersionRequest): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/content`, { method: 'PATCH', body: JSON.stringify(input) });
    return campaignDetailSchema.parse(await response.json());
  }

  async createCampaignAsset(id: string, input: CreateCampaignAssetRequest): Promise<{ id: string }> {
    const response = await this.request(`/campaigns/${id}/assets`, { method: 'POST', body: JSON.stringify(input) });
    return (await response.json()) as { id: string };
  }

  async generateCampaignImage(id: string, input: GenerateCampaignImageRequest): Promise<CampaignAssetDto> {
    const response = await this.request(`/campaigns/${id}/assets/generate`, { method: 'POST', body: JSON.stringify(input) });
    return campaignAssetSchema.parse(await response.json());
  }

  async confirmCampaignAsset(id: string, assetId: string): Promise<CampaignAssetDto> {
    const response = await this.request(`/campaigns/${id}/assets/${assetId}/confirm`, { method: 'POST' });
    return campaignAssetSchema.parse(await response.json());
  }

  async rejectCampaignAsset(id: string, assetId: string): Promise<CampaignAssetDto> {
    const response = await this.request(`/campaigns/${id}/assets/${assetId}/reject`, { method: 'POST' });
    return campaignAssetSchema.parse(await response.json());
  }

  async setCampaignOverlapResolution(id: string, input: SetOverlapResolutionRequest): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/overlap-resolution`, { method: 'PATCH', body: JSON.stringify(input) });
    return campaignDetailSchema.parse(await response.json());
  }

  async addCampaignAudience(id: string, input: AddCampaignAudienceRequest): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/audiences`, { method: 'POST', body: JSON.stringify(input) });
    return campaignDetailSchema.parse(await response.json());
  }

  async updateCampaignAudience(id: string, audienceGroupId: string, input: UpdateCampaignAudienceRequest): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/audiences/${audienceGroupId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return campaignDetailSchema.parse(await response.json());
  }

  async removeCampaignAudience(id: string, audienceGroupId: string): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/audiences/${audienceGroupId}`, { method: 'DELETE' });
    return campaignDetailSchema.parse(await response.json());
  }

  async setCampaignChannelText(id: string, input: SetCampaignChannelTextRequest): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/channel-text`, { method: 'POST', body: JSON.stringify(input) });
    return campaignDetailSchema.parse(await response.json());
  }

  async removeCampaignChannelText(id: string, channel: CommunicationChannel): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/channel-text/${channel}`, { method: 'DELETE' });
    return campaignDetailSchema.parse(await response.json());
  }

  async submitCampaignForApproval(id: string): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/submit`, { method: 'POST' });
    return campaignDetailSchema.parse(await response.json());
  }

  async approveCampaign(id: string, comment?: string): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/approve`, { method: 'POST', body: JSON.stringify({ comment }) });
    return campaignDetailSchema.parse(await response.json());
  }

  async rejectCampaign(id: string, comment?: string): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) });
    return campaignDetailSchema.parse(await response.json());
  }

  async reviseCampaign(id: string): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/revise`, { method: 'POST' });
    return campaignDetailSchema.parse(await response.json());
  }

  async scheduleCampaign(id: string, scheduledFor: string): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduledFor }),
    });
    return campaignDetailSchema.parse(await response.json());
  }

  async sendCampaignNow(id: string): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/send-now`, { method: 'POST' });
    return campaignDetailSchema.parse(await response.json());
  }

  async listDeliveryBatches(campaignId: string): Promise<DeliveryBatchListResponse> {
    const response = await this.request(`/campaigns/${campaignId}/delivery-batches`);
    return deliveryBatchListResponseSchema.parse(await response.json());
  }

  async getDeliveryBatch(campaignId: string, batchId: string): Promise<DeliveryBatchDetailDto> {
    const response = await this.request(`/campaigns/${campaignId}/delivery-batches/${batchId}`);
    return deliveryBatchDetailSchema.parse(await response.json());
  }

  async startDeliveryBatch(campaignId: string): Promise<DeliveryBatchDetailDto> {
    const response = await this.request(`/campaigns/${campaignId}/delivery-batches`, { method: 'POST' });
    return deliveryBatchDetailSchema.parse(await response.json());
  }

  async cancelCampaign(id: string): Promise<CampaignDetailDto> {
    const response = await this.request(`/campaigns/${id}/cancel`, { method: 'POST' });
    return campaignDetailSchema.parse(await response.json());
  }
}
