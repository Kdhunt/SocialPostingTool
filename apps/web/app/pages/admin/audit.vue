<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { AuditEventDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const events = ref<AuditEventDto[]>([]);
const loading = ref(true);
const actionError = ref<string | null>(null);
const actionFilter = ref('');
const entityTypeFilter = ref('');

function canRead(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('audit.read');
}

async function load(): Promise<void> {
  loading.value = true;
  actionError.value = null;
  try {
    const response = await client.listAuditEvents({
      limit: 100,
      action: actionFilter.value || undefined,
      entityType: entityTypeFilter.value || undefined,
    });
    events.value = response.events;
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to load audit log.';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  if (!canRead()) {
    await navigateTo('/');
    return;
  }
  await load();
});
</script>

<template>
  <main class="admin-page">
    <h1>Audit log</h1>

    <form class="admin-page__filters" novalidate @submit.prevent="load">
      <label for="audit-action">Action contains</label>
      <input id="audit-action" v-model="actionFilter" type="search" />

      <label for="audit-entity">Entity type</label>
      <input id="audit-entity" v-model="entityTypeFilter" type="search" />

      <button type="submit">Apply filters</button>
    </form>

    <p v-if="loading">Loading…</p>
    <p v-if="actionError" role="alert" class="admin-page__error">{{ actionError }}</p>

    <table v-else-if="events.length > 0" class="admin-page__table">
      <caption class="admin-page__sr-only">Recent audit events</caption>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">Action</th>
          <th scope="col">Entity</th>
          <th scope="col">Actor</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="event in events" :key="event.id">
          <td>{{ event.createdAt }}</td>
          <td>{{ event.action }}</td>
          <td>{{ event.entityType }}<span v-if="event.entityId"> #{{ event.entityId.slice(0, 8) }}…</span></td>
          <td>{{ event.actorDisplayName ?? 'System' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading">No audit events found.</p>
  </main>
</template>

<style scoped>
.admin-page {
  max-width: 56rem;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.admin-page__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: end;
}

.admin-page__filters input {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.admin-page__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.admin-page__table th,
.admin-page__table td {
  border: 1px solid #d0d7de;
  padding: 0.5rem;
  text-align: left;
}

.admin-page__table th {
  background: #f6f8fa;
}

.admin-page__error {
  color: #cf222e;
  font-weight: 600;
}

.admin-page__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
