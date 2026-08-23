<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

import { ApiRequestError } from '@ward-comms/api-client';
import type { PersonSummaryDto } from '@ward-comms/validation';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'loaded'; people: PersonSummaryDto[] };

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const query = ref('');
const includeInactive = ref(false);
const listState = ref<ListState>({ kind: 'loading' });

async function search(): Promise<void> {
  listState.value = { kind: 'loading' };
  try {
    const { people } = await client.searchPeople({
      query: query.value || undefined,
      includeInactive: includeInactive.value,
    });
    listState.value = people.length === 0 ? { kind: 'empty' } : { kind: 'loaded', people };
  } catch (error) {
    listState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load the directory.',
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
  <div class="directory-index">
    <LayoutPageHeader
      title="Directory"
      description="Search members, review household assignments, and open records for editing."
    >
      <template #actions>
        <UiAppButton variant="secondary" to="/directory/households">Households</UiAppButton>
        <UiAppButton to="/directory/people/new">Add person</UiAppButton>
      </template>
    </LayoutPageHeader>

    <form class="toolbar card" novalidate @submit.prevent="search">
      <UiFormField label="Search by name" input-id="directory-query">
        <input id="directory-query" v-model="query" class="form-control" type="search" placeholder="e.g. Doe" />
      </UiFormField>

      <label class="toolbar__checkbox">
        <input v-model="includeInactive" type="checkbox" />
        Include inactive members
      </label>

      <UiAppButton type="submit">Search</UiAppButton>
    </form>

    <UiLoadingState v-if="listState.kind === 'loading'" />
    <UiAlertBanner v-else-if="listState.kind === 'error'">{{ listState.message }}</UiAlertBanner>
    <UiEmptyState
      v-else-if="listState.kind === 'empty'"
      title="No people found"
      description="Try a different search term or add a new person to the directory."
    >
      <template #actions>
        <UiAppButton to="/directory/people/new">Add person</UiAppButton>
      </template>
    </UiEmptyState>

    <ul v-else class="results">
      <li v-for="person in listState.people" :key="person.id">
        <UiListCard>
          <template #title>
            <NuxtLink :to="`/directory/people/${person.id}`" class="results__link">
              {{ person.preferredName ?? `${person.firstName} ${person.lastName}` }}
            </NuxtLink>
          </template>
          <template #meta>
            <span v-if="!person.isActive" class="tag">Inactive</span>
            <span v-if="person.isMinor" class="tag tag--warning">Minor</span>
          </template>
          <template #aside>
            <span v-if="person.primaryHouseholdName">{{ person.primaryHouseholdName }}</span>
          </template>
        </UiListCard>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.directory-index {
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

.tag--warning {
  background: var(--color-warning-soft);
  border-color: rgb(154 103 0 / 0.35);
  color: var(--color-warning);
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
