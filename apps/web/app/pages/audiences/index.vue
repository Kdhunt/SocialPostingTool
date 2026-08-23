<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

import { ApiRequestError } from '@ward-comms/api-client';
import type { AudienceGroupSummaryDto } from '@ward-comms/validation';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'loaded'; audiences: AudienceGroupSummaryDto[] };

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const query = ref('');
const includeArchived = ref(false);
const listState = ref<ListState>({ kind: 'loading' });

async function search(): Promise<void> {
  listState.value = { kind: 'loading' };
  try {
    const { audiences } = await client.searchAudiences({
      query: query.value || undefined,
      includeArchived: includeArchived.value,
    });
    listState.value = audiences.length === 0 ? { kind: 'empty' } : { kind: 'loaded', audiences };
  } catch (error) {
    listState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load audiences.',
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
  <div class="audiences-index">
    <LayoutPageHeader
      title="Audiences"
      description="Organize members into groups, attach destinations, and preview who will receive a campaign."
    >
      <template #actions>
        <UiAppButton variant="secondary" to="/audiences/destinations">Destinations</UiAppButton>
        <UiAppButton to="/audiences/new">Create audience</UiAppButton>
      </template>
    </LayoutPageHeader>

    <form class="toolbar card" novalidate @submit.prevent="search">
      <UiFormField label="Search by name" input-id="audience-query">
        <input id="audience-query" v-model="query" class="form-control" type="search" placeholder="e.g. announcements" />
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
      title="No audiences yet"
      description="Create an audience group to target members for email, SMS, or social posts."
    >
      <template #actions>
        <UiAppButton to="/audiences/new">Create audience</UiAppButton>
      </template>
    </UiEmptyState>

    <ul v-else class="results">
      <li v-for="audience in listState.audiences" :key="audience.id">
        <UiListCard>
          <template #title>
            <NuxtLink :to="`/audiences/${audience.id}`" class="results__link">{{ audience.name }}</NuxtLink>
          </template>
          <template #meta>
            <span v-if="!audience.isActive" class="tag">Archived</span>
          </template>
          <template #aside>
            <span>{{ audience.memberCount }} members</span>
            <span>{{ audience.destinationCount }} destinations</span>
          </template>
        </UiListCard>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.audiences-index {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) auto auto;
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
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border-strong);
  color: var(--color-text-muted);
}

@media (max-width: 768px) {
  .toolbar {
    grid-template-columns: 1fr;
  }

  .toolbar__checkbox {
    padding-bottom: 0;
  }
}
</style>
