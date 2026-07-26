<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo, useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { HouseholdDetailDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; household: HouseholdDetailDto };

const route = useRoute();
const householdId = route.params.id as string;
const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const pageState = ref<PageState>({ kind: 'loading' });
const actionError = ref<string | null>(null);

const editName = ref('');
const editAddressLine1 = ref('');
const editCity = ref('');

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const household = await client.getHousehold(householdId);
    pageState.value = { kind: 'loaded', household };
    editName.value = household.name;
    editAddressLine1.value = household.addressLine1 ?? '';
    editCity.value = household.city ?? '';
  } catch (error) {
    pageState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load household.',
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

async function saveBasicInfo(): Promise<void> {
  actionError.value = null;
  try {
    const household = await client.updateHousehold(householdId, {
      name: editName.value,
      addressLine1: editAddressLine1.value || undefined,
      city: editCity.value || undefined,
    });
    pageState.value = { kind: 'loaded', household };
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to save household.';
  }
}

async function archiveHousehold(): Promise<void> {
  actionError.value = null;
  try {
    await client.archiveHousehold(householdId);
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to archive household.';
  }
}
</script>

<template>
  <main class="household-page">
    <p><NuxtLink to="/directory/households">&larr; Back to households</NuxtLink></p>

    <p v-if="pageState.kind === 'loading'">Loading…</p>
    <p v-else-if="pageState.kind === 'error'" role="alert" class="household-page__error">{{ pageState.message }}</p>

    <template v-else-if="pageState.kind === 'loaded'">
      <header class="household-page__header">
        <h1>{{ pageState.household.name }}</h1>
        <span v-if="!pageState.household.isActive" class="household-page__tag">Inactive</span>
      </header>

      <p v-if="actionError" role="alert" class="household-page__error">{{ actionError }}</p>

      <section aria-labelledby="household-info-heading">
        <h2 id="household-info-heading">Household info</h2>
        <form class="household-page__form" novalidate @submit.prevent="saveBasicInfo">
          <label for="edit-name">Name</label>
          <input id="edit-name" v-model="editName" type="text" required />

          <label for="edit-address">Address</label>
          <input id="edit-address" v-model="editAddressLine1" type="text" />

          <label for="edit-city">City</label>
          <input id="edit-city" v-model="editCity" type="text" />

          <button type="submit">Save</button>
        </form>

        <button v-if="pageState.household.isActive" type="button" @click="archiveHousehold">Mark inactive</button>
      </section>

      <section aria-labelledby="members-heading">
        <h2 id="members-heading">Members</h2>
        <ul class="household-page__list">
          <li v-for="member in pageState.household.members" :key="member.personId">
            <NuxtLink :to="`/directory/people/${member.personId}`">{{ member.displayName }}</NuxtLink>
            ({{ member.householdRole }})
            <span v-if="member.isMinor" class="household-page__tag household-page__tag--minor">Minor</span>
          </li>
          <li v-if="pageState.household.members.length === 0">No current members. Add members from a person's page.</li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.household-page {
  max-width: 36rem;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.household-page__header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.household-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 24rem;
  margin-bottom: 0.75rem;
}

.household-page__form input {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.household-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.household-page__list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.household-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #eaeef2;
  border: 1px solid #57606a;
}

.household-page__tag--minor {
  background: #fff8c5;
  border-color: #9a6700;
}

.household-page__error {
  color: #cf222e;
  font-weight: 600;
}

button {
  cursor: pointer;
}

a:focus-visible,
button:focus-visible,
input:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
