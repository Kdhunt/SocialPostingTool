<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

import { ApiRequestError } from '@ward-comms/api-client';
import type { CampaignSummaryDto, CampaignStatusDto } from '@ward-comms/validation';
import { campaignStatusLabel } from '~/utils/display-labels';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'loaded'; campaigns: CampaignSummaryDto[] };

const STATUS_OPTIONS: CampaignStatusDto[] = [
  'Draft',
  'PendingApproval',
  'Approved',
  'Rejected',
  'Scheduled',
  'Sending',
  'Sent',
  'Cancelled',
];

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const query = ref('');
const status = ref<CampaignStatusDto | ''>('');
const includeArchived = ref(false);
const listState = ref<ListState>({ kind: 'loading' });

function canCreate(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('campaigns.create');
}

async function search(): Promise<void> {
  listState.value = { kind: 'loading' };
  try {
    const { campaigns } = await client.searchCampaigns({
      query: query.value || undefined,
      status: status.value || undefined,
      includeArchived: includeArchived.value,
    });
    listState.value = campaigns.length === 0 ? { kind: 'empty' } : { kind: 'loaded', campaigns };
  } catch (error) {
    listState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load campaigns.',
    };
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  await search();
});
</script>

<template>
  <LayoutPageContainer>
    <LayoutPageHeader
      title="Campaigns"
      description="Draft content, resolve audience overlap, request approval, and track delivery status."
    >
      <template #actions>
        <UiAppButton v-if="canCreate()" to="/campaigns/new">Create campaign</UiAppButton>
      </template>
    </LayoutPageHeader>

    <UiAlertBanner tone="info">
      Local development uses the provider simulator — no messages are sent to real email, SMS, or social accounts.
    </UiAlertBanner>

    <form class="toolbar card" novalidate @submit.prevent="search">
      <UiFormField label="Search by name" input-id="campaign-query">
        <input id="campaign-query" v-model="query" class="form-control" type="search" placeholder="e.g. ward conference" />
      </UiFormField>

      <UiFormField label="Status" input-id="campaign-status">
        <select id="campaign-status" v-model="status" class="form-control">
          <option value="">Any status</option>
          <option v-for="option in STATUS_OPTIONS" :key="option" :value="option">{{ campaignStatusLabel(option) }}</option>
        </select>
      </UiFormField>

      <label class="toolbar__checkbox">
        <input v-model="includeArchived" type="checkbox" />
        Include archived
      </label>

      <UiAppButton type="submit">Search</UiAppButton>
    </form>

    <UiLoadingState v-if="listState.kind === 'loading'" />
    <UiAlertBanner v-else-if="listState.kind === 'error'">{{ listState.message }}</UiAlertBanner>
    <UiEmptyState
      v-else-if="listState.kind === 'empty'"
      title="No campaigns found"
      description="Create a campaign to compose a message and choose who should receive it."
    >
      <template v-if="canCreate()" #actions>
        <UiAppButton to="/campaigns/new">Create campaign</UiAppButton>
      </template>
    </UiEmptyState>

    <ul v-else class="results">
      <li v-for="campaign in listState.campaigns" :key="campaign.id">
        <UiListCard>
          <template #title>
            <NuxtLink :to="`/campaigns/${campaign.id}`" class="results__link">{{ campaign.name }}</NuxtLink>
          </template>
          <template #meta>
            <span class="tag">{{ campaignStatusLabel(campaign.status) }}</span>
            <span v-if="!campaign.isActive" class="tag">Archived</span>
          </template>
          <template #aside>
            <span>Version {{ campaign.currentVersionNumber }}</span>
            <span>{{ campaign.audienceCount }} audiences</span>
          </template>
        </UiListCard>
      </li>
    </ul>
  </LayoutPageContainer>
</template>

<style scoped>
.toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(10rem, 1fr)) auto auto;
  gap: var(--space-4);
  align-items: end;
  padding: var(--space-5);
}

.toolbar__checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9375rem;
  color: var(--color-text-muted);
  padding-bottom: 0.625rem;
}

.results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.results__link {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
  text-decoration: none;
}

.results__link:hover {
  color: var(--color-brand);
  text-decoration: none;
}

.tag {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--color-brand-soft);
  border: 1px solid rgb(30 77 140 / 0.2);
  color: var(--color-brand);
}

@media (max-width: 900px) {
  .toolbar {
    grid-template-columns: 1fr;
  }

  .toolbar__checkbox {
    padding-bottom: 0;
  }
}
</style>
