<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { HouseholdListResponse } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; households: HouseholdListResponse['households'] };

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();
const listState = ref<ListState>({ kind: 'loading' });

async function load(): Promise<void> {
  listState.value = { kind: 'loading' };
  try {
    const { households } = await client.listHouseholds();
    listState.value = { kind: 'loaded', households };
  } catch (error) {
    listState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load households.',
    };
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  await load();
});
</script>

<template>
  <main class="households-page">
    <header class="households-page__header">
      <h1>Households</h1>
      <div class="households-page__actions">
        <NuxtLink to="/directory">Directory</NuxtLink>
        <NuxtLink to="/directory/households/new">Add household</NuxtLink>
      </div>
    </header>

    <p v-if="listState.kind === 'loading'">Loading…</p>
    <p v-else-if="listState.kind === 'error'" role="alert" class="households-page__error">{{ listState.message }}</p>
    <p v-else-if="listState.households.length === 0">No households yet.</p>

    <ul v-else class="households-page__list">
      <li v-for="household in listState.households" :key="household.id">
        <NuxtLink :to="`/directory/households/${household.id}`">{{ household.name }}</NuxtLink>
        <span v-if="!household.isActive" class="households-page__tag">Inactive</span>
        <span class="households-page__count">{{ household.memberCount }} member(s)</span>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.households-page {
  max-width: 40rem;
  margin: 2rem auto;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.households-page__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.households-page__actions {
  display: flex;
  gap: 1rem;
}

.households-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.households-page__list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.households-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #eaeef2;
  border: 1px solid #57606a;
}

.households-page__count {
  margin-left: auto;
  color: #57606a;
  font-size: 0.875rem;
}

.households-page__error {
  color: #cf222e;
  font-weight: 600;
}

a:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
