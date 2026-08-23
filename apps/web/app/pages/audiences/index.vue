<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { AudienceGroupSummaryDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

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
  <main class="audiences-page">
    <header class="audiences-page__header">
      <h1>Audiences</h1>
      <div class="audiences-page__actions">
        <NuxtLink to="/directory">Directory</NuxtLink>
        <NuxtLink to="/audiences/destinations">Destinations</NuxtLink>
        <NuxtLink to="/audiences/new">Create audience</NuxtLink>
      </div>
    </header>

    <form class="audiences-page__search" novalidate @submit.prevent="search">
      <label for="audience-query">Search by name</label>
      <input id="audience-query" v-model="query" type="search" placeholder="e.g. announcements" />

      <label class="audiences-page__checkbox">
        <input v-model="includeArchived" type="checkbox" />
        Include archived
      </label>

      <button type="submit">Search</button>
    </form>

    <p v-if="listState.kind === 'loading'">Loading…</p>
    <p v-else-if="listState.kind === 'error'" role="alert" class="audiences-page__error">{{ listState.message }}</p>
    <p v-else-if="listState.kind === 'empty'">No audiences found. Create one to get started.</p>

    <ul v-else-if="listState.kind === 'loaded'" class="audiences-page__list">
      <li v-for="audience in listState.audiences" :key="audience.id">
        <NuxtLink :to="`/audiences/${audience.id}`">{{ audience.name }}</NuxtLink>
        <span v-if="!audience.isActive" class="audiences-page__tag">Archived</span>
        <span class="audiences-page__count">{{ audience.memberCount }} member(s)</span>
        <span class="audiences-page__count">{{ audience.destinationCount }} destination(s)</span>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.audiences-page {
  max-width: 48rem;
  margin: 2rem auto;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.audiences-page__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.audiences-page__actions {
  display: flex;
  gap: 1rem;
}

.audiences-page__search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.audiences-page__search input[type='search'] {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.audiences-page__checkbox {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.audiences-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.audiences-page__list li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.audiences-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #eaeef2;
  border: 1px solid #57606a;
}

.audiences-page__count {
  margin-left: auto;
  color: #57606a;
  font-size: 0.875rem;
}

.audiences-page__count + .audiences-page__count {
  margin-left: 0;
}

.audiences-page__error {
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
