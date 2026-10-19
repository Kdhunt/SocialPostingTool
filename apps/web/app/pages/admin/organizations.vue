<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { UnitOrganizationDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const loading = ref(true);
const organizations = ref<UnitOrganizationDto[]>([]);
const drafts = ref<Record<string, string>>({});
const newName = ref('');
const busyId = ref<string | null>(null);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);

function fail(error: unknown, fallback: string): void {
  actionError.value = error instanceof ApiRequestError ? error.message : fallback;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await client.listUnitOrganizations();
    organizations.value = result.organizations;
    drafts.value = Object.fromEntries(result.organizations.map((org) => [org.id, org.name]));
  } catch (error) {
    fail(error, 'Unable to load organizations.');
  } finally {
    loading.value = false;
  }
}

async function add(): Promise<void> {
  actionError.value = null;
  notice.value = null;
  busyId.value = 'new';
  try {
    const created = await client.createUnitOrganization(newName.value);
    newName.value = '';
    notice.value = `Added ${created.name}.`;
    await load();
  } catch (error) {
    fail(error, 'Unable to add that organization.');
  } finally {
    busyId.value = null;
  }
}

async function rename(org: UnitOrganizationDto): Promise<void> {
  actionError.value = null;
  notice.value = null;
  busyId.value = org.id;
  try {
    const updated = await client.renameUnitOrganization(org.id, drafts.value[org.id] ?? '');
    notice.value = `Renamed to ${updated.name}.`;
    await load();
  } catch (error) {
    fail(error, 'Unable to rename.');
  } finally {
    busyId.value = null;
  }
}

async function archive(org: UnitOrganizationDto): Promise<void> {
  if (
    !window.confirm(
      `Remove ${org.name}? Existing bulletin sections keep its name; new sections can’t use it.`,
    )
  )
    return;
  actionError.value = null;
  notice.value = null;
  busyId.value = org.id;
  try {
    await client.archiveUnitOrganization(org.id);
    notice.value = `Removed ${org.name}.`;
    await load();
  } catch (error) {
    fail(error, 'Unable to remove.');
  } finally {
    busyId.value = null;
  }
}

onMounted(async () => {
  await refreshSession();
  if (
    authState.value.kind !== 'authenticated' ||
    !authState.value.user.permissions.includes('ward.manage')
  ) {
    await navigateTo(authState.value.kind === 'anonymous' ? '/login' : '/');
    return;
  }
  await load();
});
</script>

<template>
  <div class="orgs">
    <header>
      <h2 class="orgs__title">Organizations</h2>
      <p class="orgs__lede">
        Bulletin sections are filed under one of these. Rename them to match your unit, or add your
        own.
      </p>
    </header>

    <UiAlertBanner v-if="actionError">{{ actionError }}</UiAlertBanner>
    <UiAlertBanner v-if="notice" tone="success">{{ notice }}</UiAlertBanner>
    <UiLoadingState v-if="loading" message="Loading organizations…" />

    <ul v-else class="orgs__list">
      <li v-for="org in organizations" :key="org.id" class="orgs__item">
        <form class="orgs__row" novalidate @submit.prevent="rename(org)">
          <label class="visually-hidden" :for="`org-${org.id}`">Name</label>
          <input
            :id="`org-${org.id}`"
            v-model="drafts[org.id]"
            class="form-control"
            type="text"
            maxlength="80"
          />
          <UiAppButton
            type="submit"
            variant="secondary"
            :disabled="busyId !== null || (drafts[org.id] ?? '').trim() === org.name"
          >
            Rename
          </UiAppButton>
          <UiAppButton
            type="button"
            variant="ghost"
            :disabled="busyId !== null"
            @click="archive(org)"
            >Remove</UiAppButton
          >
        </form>
      </li>
    </ul>

    <form class="orgs__row orgs__add" novalidate @submit.prevent="add">
      <UiFormField
        label="Add an organization"
        input-id="org-new"
        hint="For example Elders Quorum or Activities."
      >
        <input id="org-new" v-model="newName" class="form-control" type="text" maxlength="80" />
      </UiFormField>
      <UiAppButton type="submit" :disabled="busyId !== null || newName.trim() === ''"
        >Add</UiAppButton
      >
    </form>
  </div>
</template>

<style scoped>
.orgs {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 40rem;
}

.orgs__title {
  font-size: 1.375rem;
  font-weight: 700;
}

.orgs__lede {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
}

.orgs__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.orgs__item {
  padding: var(--space-3) var(--space-4);
}

.orgs__item + .orgs__item {
  border-top: 1px solid var(--color-border);
}

.orgs__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

.orgs__row .form-control {
  flex: 1;
  min-width: 12rem;
}

.orgs__add :deep(.field) {
  flex: 1;
  min-width: 14rem;
}
</style>
