<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo, useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { AudienceGroupDetailDto, CommunicationDestinationDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; audience: AudienceGroupDetailDto };

const route = useRoute();
const audienceId = route.params.id as string;
const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const pageState = ref<PageState>({ kind: 'loading' });
const actionError = ref<string | null>(null);

const editName = ref('');
const editDescription = ref('');

const newMemberPersonId = ref('');
const availableDestinations = ref<CommunicationDestinationDto[]>([]);
const selectedDestinationId = ref('');

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const audience = await client.getAudience(audienceId);
    pageState.value = { kind: 'loaded', audience };
    editName.value = audience.name;
    editDescription.value = audience.description ?? '';
  } catch (error) {
    pageState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load audience.',
    };
  }
}

async function loadDestinations(): Promise<void> {
  try {
    const { destinations } = await client.listDestinations();
    availableDestinations.value = destinations;
  } catch {
    // Destination list is a convenience for the picker; the page still works without it.
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  await Promise.all([load(), loadDestinations()]);
});

function withActionErrorHandling(action: () => Promise<AudienceGroupDetailDto>): () => Promise<void> {
  return async () => {
    actionError.value = null;
    try {
      const audience = await action();
      pageState.value = { kind: 'loaded', audience };
    } catch (error) {
      actionError.value = error instanceof ApiRequestError ? error.message : 'Action failed.';
    }
  };
}

const saveBasicInfo = withActionErrorHandling(() =>
  client.updateAudience(audienceId, {
    name: editName.value,
    description: editDescription.value || null,
  }),
);

const addMember = withActionErrorHandling(async () => {
  const result = await client.addAudienceMember(audienceId, { personId: newMemberPersonId.value });
  newMemberPersonId.value = '';
  return result;
});

function removeMember(personId: string): Promise<void> {
  return withActionErrorHandling(() => client.removeAudienceMember(audienceId, personId))();
}

const addDestination = withActionErrorHandling(async () => {
  const result = await client.addAudienceDestination(audienceId, { destinationId: selectedDestinationId.value });
  selectedDestinationId.value = '';
  return result;
});

function removeDestination(destinationId: string): Promise<void> {
  return withActionErrorHandling(() => client.removeAudienceDestination(audienceId, destinationId))();
}

async function archiveAudience(): Promise<void> {
  actionError.value = null;
  try {
    await client.archiveAudience(audienceId);
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to archive audience.';
  }
}

async function restoreAudience(): Promise<void> {
  actionError.value = null;
  try {
    await client.restoreAudience(audienceId);
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to restore audience.';
  }
}

async function deleteAudience(): Promise<void> {
  actionError.value = null;
  try {
    await client.deleteAudience(audienceId);
    await navigateTo('/audiences');
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to delete audience.';
  }
}
</script>

<template>
  <main class="audience-page">
    <p><NuxtLink to="/audiences">&larr; Back to audiences</NuxtLink></p>

    <p v-if="pageState.kind === 'loading'">Loading…</p>
    <p v-else-if="pageState.kind === 'error'" role="alert" class="audience-page__error">{{ pageState.message }}</p>

    <template v-else-if="pageState.kind === 'loaded'">
      <header class="audience-page__header">
        <h1>{{ pageState.audience.name }}</h1>
        <span v-if="!pageState.audience.isActive" class="audience-page__tag">Archived</span>
      </header>

      <p v-if="actionError" role="alert" class="audience-page__error">{{ actionError }}</p>

      <section aria-labelledby="audience-info-heading">
        <h2 id="audience-info-heading">Audience info</h2>
        <form class="audience-page__form" novalidate @submit.prevent="saveBasicInfo">
          <label for="edit-name">Name</label>
          <input id="edit-name" v-model="editName" type="text" required />

          <label for="edit-description">Description</label>
          <textarea id="edit-description" v-model="editDescription" rows="3"></textarea>

          <button type="submit">Save</button>
        </form>

        <div class="audience-page__lifecycle-actions">
          <button v-if="pageState.audience.isActive" type="button" @click="archiveAudience">Archive</button>
          <button v-else type="button" @click="restoreAudience">Restore</button>
          <button type="button" class="audience-page__danger" @click="deleteAudience">
            Delete permanently
          </button>
        </div>
        <p class="audience-page__hint">
          Deleting only succeeds when this audience has no members and no linked destinations — otherwise, archive
          it instead.
        </p>
      </section>

      <section aria-labelledby="members-heading">
        <h2 id="members-heading">Members ({{ pageState.audience.members.length }})</h2>
        <ul class="audience-page__list">
          <li v-for="member in pageState.audience.members" :key="member.personId">
            <NuxtLink :to="`/directory/people/${member.personId}`">{{ member.displayName }}</NuxtLink>
            <span v-if="member.isMinor" class="audience-page__tag audience-page__tag--minor">Minor</span>
            <span v-if="!member.isActive" class="audience-page__tag">Inactive</span>
            <button type="button" @click="removeMember(member.personId)">Remove</button>
          </li>
          <li v-if="pageState.audience.members.length === 0">No members yet.</li>
        </ul>

        <form class="audience-page__inline-form" novalidate @submit.prevent="addMember">
          <label for="new-member-person-id">Person ID</label>
          <input id="new-member-person-id" v-model="newMemberPersonId" type="text" required />
          <button type="submit">Add member</button>
        </form>
        <p class="audience-page__hint">
          Find a person's ID from the <NuxtLink to="/directory">directory search</NuxtLink>.
        </p>
      </section>

      <section aria-labelledby="destinations-heading">
        <h2 id="destinations-heading">Destinations ({{ pageState.audience.destinations.length }})</h2>
        <ul class="audience-page__list">
          <li v-for="destination in pageState.audience.destinations" :key="destination.destinationId">
            {{ destination.name }} ({{ destination.channel }})
            <button type="button" @click="removeDestination(destination.destinationId)">Unlink</button>
          </li>
          <li v-if="pageState.audience.destinations.length === 0">No destinations linked yet.</li>
        </ul>

        <form class="audience-page__inline-form" novalidate @submit.prevent="addDestination">
          <label for="destination-select">Destination</label>
          <select id="destination-select" v-model="selectedDestinationId" required>
            <option value="" disabled>Choose a destination</option>
            <option v-for="destination in availableDestinations" :key="destination.id" :value="destination.id">
              {{ destination.name }} ({{ destination.channel }})
            </option>
          </select>
          <button type="submit">Link destination</button>
        </form>
      </section>
    </template>
  </main>
</template>

<style scoped>
.audience-page {
  max-width: 40rem;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.audience-page__header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.audience-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 24rem;
  margin-bottom: 0.75rem;
}

.audience-page__form input,
.audience-page__form textarea {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-family: inherit;
}

.audience-page__lifecycle-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.audience-page__danger {
  color: #cf222e;
  border-color: #cf222e;
}

.audience-page__hint {
  color: #57606a;
  font-size: 0.875rem;
}

.audience-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.audience-page__list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.audience-page__inline-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.audience-page__inline-form input,
.audience-page__inline-form select {
  padding: 0.375rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.audience-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #eaeef2;
  border: 1px solid #57606a;
}

.audience-page__tag--minor {
  background: #fff8c5;
  border-color: #9a6700;
}

.audience-page__error {
  color: #cf222e;
  font-weight: 600;
}

button {
  cursor: pointer;
}

a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
