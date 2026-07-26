<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { CampaignSummaryDto, CampaignStatusDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

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
  <main class="campaigns-page">
    <header class="campaigns-page__header">
      <h1>Campaigns</h1>
      <div class="campaigns-page__actions">
        <NuxtLink to="/audiences">Audiences</NuxtLink>
        <NuxtLink v-if="canCreate()" to="/campaigns/new">Create campaign</NuxtLink>
      </div>
    </header>

    <p class="campaigns-page__hint">
      Campaigns are drafted, previewed, and approved here. No message is ever sent to a real provider — sending is
      simulated for local development (see the provider simulator).
    </p>

    <form class="campaigns-page__search" novalidate @submit.prevent="search">
      <label for="campaign-query">Search by name</label>
      <input id="campaign-query" v-model="query" type="search" placeholder="e.g. ward conference" />

      <label for="campaign-status">Status</label>
      <select id="campaign-status" v-model="status">
        <option value="">Any</option>
        <option v-for="option in STATUS_OPTIONS" :key="option" :value="option">{{ option }}</option>
      </select>

      <label class="campaigns-page__checkbox">
        <input v-model="includeArchived" type="checkbox" />
        Include archived
      </label>

      <button type="submit">Search</button>
    </form>

    <p v-if="listState.kind === 'loading'">Loading…</p>
    <p v-else-if="listState.kind === 'error'" role="alert" class="campaigns-page__error">{{ listState.message }}</p>
    <p v-else-if="listState.kind === 'empty'">No campaigns found.</p>

    <ul v-else-if="listState.kind === 'loaded'" class="campaigns-page__list">
      <li v-for="campaign in listState.campaigns" :key="campaign.id">
        <NuxtLink :to="`/campaigns/${campaign.id}`">{{ campaign.name }}</NuxtLink>
        <span class="campaigns-page__tag">{{ campaign.status }}</span>
        <span v-if="!campaign.isActive" class="campaigns-page__tag">Archived</span>
        <span class="campaigns-page__count">v{{ campaign.currentVersionNumber }}</span>
        <span class="campaigns-page__count">{{ campaign.audienceCount }} audience(s)</span>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.campaigns-page {
  max-width: 52rem;
  margin: 2rem auto;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.campaigns-page__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.campaigns-page__actions {
  display: flex;
  gap: 1rem;
}

.campaigns-page__hint {
  color: #57606a;
}

.campaigns-page__search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.campaigns-page__search input[type='search'],
.campaigns-page__search select {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.campaigns-page__checkbox {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.campaigns-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.campaigns-page__list li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.campaigns-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #eaeef2;
  border: 1px solid #57606a;
}

.campaigns-page__count {
  margin-left: auto;
  color: #57606a;
  font-size: 0.875rem;
}

.campaigns-page__count + .campaigns-page__count {
  margin-left: 0;
}

.campaigns-page__error {
  color: #cf222e;
  font-weight: 600;
}

a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
