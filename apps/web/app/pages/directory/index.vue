<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { PersonSummaryDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

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
    listState.value = { kind: 'error', message: error instanceof ApiRequestError ? error.message : 'Unable to load the directory.' };
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
  <main class="directory-page">
    <header class="directory-page__header">
      <h1>Directory</h1>
      <div class="directory-page__actions">
        <NuxtLink to="/directory/households">Households</NuxtLink>
        <NuxtLink to="/directory/people/new">Add person</NuxtLink>
      </div>
    </header>

    <form class="directory-page__search" novalidate @submit.prevent="search">
      <label for="directory-query">Search by name</label>
      <input id="directory-query" v-model="query" type="search" placeholder="e.g. Doe" />

      <label class="directory-page__checkbox">
        <input v-model="includeInactive" type="checkbox" />
        Include inactive
      </label>

      <button type="submit">Search</button>
    </form>

    <p v-if="listState.kind === 'loading'">Loading…</p>
    <p v-else-if="listState.kind === 'error'" role="alert" class="directory-page__error">{{ listState.message }}</p>
    <p v-else-if="listState.kind === 'empty'">No people found.</p>

    <ul v-else-if="listState.kind === 'loaded'" class="directory-page__list">
      <li v-for="person in listState.people" :key="person.id">
        <NuxtLink :to="`/directory/people/${person.id}`">
          {{ person.preferredName ?? `${person.firstName} ${person.lastName}` }}
        </NuxtLink>
        <span v-if="!person.isActive" class="directory-page__tag">Inactive</span>
        <span v-if="person.isMinor" class="directory-page__tag directory-page__tag--minor">Minor</span>
        <span v-if="person.primaryHouseholdName" class="directory-page__household">{{ person.primaryHouseholdName }}</span>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.directory-page {
  max-width: 48rem;
  margin: 2rem auto;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.directory-page__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.directory-page__actions {
  display: flex;
  gap: 1rem;
}

.directory-page__search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.directory-page__search input[type='search'] {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.directory-page__checkbox {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.directory-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.directory-page__list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.directory-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #eaeef2;
  border: 1px solid #57606a;
}

.directory-page__tag--minor {
  background: #fff8c5;
  border-color: #9a6700;
}

.directory-page__household {
  margin-left: auto;
  color: #57606a;
  font-size: 0.875rem;
}

.directory-page__error {
  color: #cf222e;
  font-weight: 600;
}

a:focus-visible,
button:focus-visible,
input:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
