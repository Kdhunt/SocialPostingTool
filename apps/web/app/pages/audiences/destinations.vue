<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { CommunicationDestinationDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; destinations: CommunicationDestinationDto[] };

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const listState = ref<ListState>({ kind: 'loading' });
const actionError = ref<string | null>(null);

const newName = ref('');
const newChannel = ref<'Email' | 'Sms' | 'FacebookPage'>('Email');
const newProviderAccountReference = ref('');

async function load(): Promise<void> {
  listState.value = { kind: 'loading' };
  try {
    const { destinations } = await client.listDestinations(true);
    listState.value = { kind: 'loaded', destinations };
  } catch (error) {
    listState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load destinations.',
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

async function createDestination(): Promise<void> {
  actionError.value = null;
  try {
    await client.createDestination({
      name: newName.value,
      channel: newChannel.value,
      providerAccountReference: newProviderAccountReference.value || undefined,
    });
    newName.value = '';
    newProviderAccountReference.value = '';
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to create destination.';
  }
}

async function archiveDestination(id: string): Promise<void> {
  actionError.value = null;
  try {
    await client.archiveDestination(id);
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to archive destination.';
  }
}
</script>

<template>
  <main class="destinations-page">
    <p><NuxtLink to="/audiences">&larr; Back to audiences</NuxtLink></p>
    <h1>Communication destinations</h1>
    <p class="destinations-page__hint">
      Destinations represent where a message can be sent (an email list, an SMS number, a Facebook Page). Real
      provider credentials are configured separately and are never shown here.
    </p>

    <p v-if="actionError" role="alert" class="destinations-page__error">{{ actionError }}</p>

    <form class="destinations-page__form" novalidate @submit.prevent="createDestination">
      <label for="destination-name">Name</label>
      <input id="destination-name" v-model="newName" type="text" required />

      <label for="destination-channel">Channel</label>
      <select id="destination-channel" v-model="newChannel">
        <option value="Email">Email</option>
        <option value="Sms">SMS</option>
        <option value="FacebookPage">Facebook Page</option>
      </select>

      <label for="destination-reference">Provider account reference (optional)</label>
      <input id="destination-reference" v-model="newProviderAccountReference" type="text" />

      <button type="submit">Add destination</button>
    </form>

    <p v-if="listState.kind === 'loading'">Loading…</p>
    <p v-else-if="listState.kind === 'error'" role="alert" class="destinations-page__error">{{ listState.message }}</p>

    <ul v-else-if="listState.kind === 'loaded'" class="destinations-page__list">
      <li v-for="destination in listState.destinations" :key="destination.id">
        {{ destination.name }} ({{ destination.channel }})
        <span v-if="!destination.isActive" class="destinations-page__tag">Archived</span>
        <button v-if="destination.isActive" type="button" @click="archiveDestination(destination.id)">Archive</button>
      </li>
      <li v-if="listState.destinations.length === 0">No destinations yet.</li>
    </ul>
  </main>
</template>

<style scoped>
.destinations-page {
  max-width: 36rem;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.destinations-page__hint {
  color: #57606a;
}

.destinations-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 24rem;
}

.destinations-page__form input,
.destinations-page__form select {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.destinations-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.destinations-page__list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.destinations-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #eaeef2;
  border: 1px solid #57606a;
}

.destinations-page__error {
  color: #cf222e;
  font-weight: 600;
}

button {
  cursor: pointer;
}

a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
