<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { CreateWardResponse, WardSummaryDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; wards: WardSummaryDto[] };

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const pageState = ref<PageState>({ kind: 'loading' });
const actionError = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const submitting = ref(false);
const createdWard = ref<CreateWardResponse | null>(null);

const wardName = ref('');
const timeZone = ref('America/Denver');
const adminUsername = ref('');
const adminDisplayName = ref('');
const adminPassword = ref('');
const initialWardCode = ref('');

function canManageWards(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('platform.wards.manage');
}

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const { wards } = await client.listWards();
    pageState.value = { kind: 'loaded', wards };
  } catch (error) {
    pageState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load wards.',
    };
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  if (!canManageWards()) {
    await navigateTo('/');
    return;
  }
  await load();
});

async function createWard(): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  createdWard.value = null;
  submitting.value = true;

  try {
    const result = await client.createWard({
      name: wardName.value.trim(),
      timeZone: timeZone.value.trim() || undefined,
      adminUsername: adminUsername.value.trim(),
      adminDisplayName: adminDisplayName.value.trim(),
      adminPassword: adminPassword.value,
      initialWardCode: initialWardCode.value,
    });

    createdWard.value = result;
    successMessage.value = `Ward "${result.ward.name}" was created. Share the admin credentials and ward code securely with the new ward administrator.`;
    wardName.value = '';
    adminUsername.value = '';
    adminDisplayName.value = '';
    adminPassword.value = '';
    initialWardCode.value = '';
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to create ward.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="admin-page">
    <h1>Ward provisioning</h1>
    <p class="admin-page__intro">
      Create additional ward tenants. Each ward gets its own admin account and shared ward code.
    </p>

    <p v-if="pageState.kind === 'loading'">Loading…</p>
    <UiAlertBanner v-if="pageState.kind === 'error'">{{ pageState.message }}</UiAlertBanner>
    <UiAlertBanner v-if="actionError">{{ actionError }}</UiAlertBanner>
    <UiAlertBanner v-if="successMessage" tone="success">{{ successMessage }}</UiAlertBanner>

    <section v-if="createdWard" class="admin-page__success" aria-live="polite">
      <h2>New ward created</h2>
      <p><strong>Ward:</strong> {{ createdWard.ward.name }}</p>
      <p><strong>Admin username:</strong> {{ createdWard.adminUsername }}</p>
      <p class="admin-page__hint">
        Store the password and ward code you entered in a secure channel. They cannot be retrieved from this screen.
      </p>
    </section>

    <section aria-labelledby="create-ward-heading">
      <h2 id="create-ward-heading">Create ward</h2>
      <form class="admin-page__form" novalidate @submit.prevent="createWard">
        <UiFormField label="Ward name" input-id="ward-name" hint="Must be unique among active wards.">
          <input id="ward-name" v-model="wardName" class="form-control" type="text" required autocomplete="off" />
        </UiFormField>

        <UiFormField label="Time zone" input-id="ward-time-zone" hint="IANA time zone, for example America/Denver.">
          <input id="ward-time-zone" v-model="timeZone" class="form-control" type="text" required autocomplete="off" />
        </UiFormField>

        <UiFormField label="Initial admin username" input-id="admin-username">
          <input id="admin-username" v-model="adminUsername" class="form-control" type="text" required autocomplete="off" />
        </UiFormField>

        <UiFormField label="Initial admin display name" input-id="admin-display-name">
          <input id="admin-display-name" v-model="adminDisplayName" class="form-control" type="text" required autocomplete="off" />
        </UiFormField>

        <UiFormField label="Initial admin password" input-id="admin-password" hint="Minimum 12 characters.">
          <input id="admin-password" v-model="adminPassword" class="form-control" type="password" required autocomplete="new-password" />
        </UiFormField>

        <UiFormField
          label="Initial ward code"
          input-id="initial-ward-code"
          hint="Shared by all members of this ward. It is stored only as a hash and cannot be shown again."
        >
          <input id="initial-ward-code" v-model="initialWardCode" class="form-control" type="password" required autocomplete="new-password" />
        </UiFormField>

        <UiAppButton type="submit" :disabled="submitting">
          {{ submitting ? 'Creating…' : 'Create ward' }}
        </UiAppButton>
      </form>
    </section>

    <section v-if="pageState.kind === 'loaded'" aria-labelledby="wards-heading">
      <h2 id="wards-heading">Active wards</h2>
      <UiEmptyState v-if="pageState.wards.length === 0" title="No wards yet" description="Create the first ward using the form above." />
      <ul v-else class="admin-page__list">
        <li v-for="ward in pageState.wards" :key="ward.id">
          <strong>{{ ward.name }}</strong>
          <span class="admin-page__hint">{{ ward.timeZone }}</span>
          <span class="admin-page__hint">Created {{ new Date(ward.createdAt).toLocaleString() }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 40rem;
}

.admin-page__intro {
  color: var(--color-text-muted);
}

.admin-page__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-page__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-page__list li {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.admin-page__hint {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.admin-page__success {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}
</style>
