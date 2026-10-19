<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { BulletinSummaryDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';
import { bulletinLanguageName } from '~/utils/bulletin-languages';

definePageMeta({ layout: 'authenticated' });

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; bulletins: BulletinSummaryDto[] };

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();
const listState = ref<ListState>({ kind: 'loading' });
const creating = ref(false);
const actionError = ref<string | null>(null);

function canCreate(): boolean {
  return (
    authState.value.kind === 'authenticated' &&
    authState.value.user.permissions.includes('campaigns.create')
  );
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

async function load(): Promise<void> {
  listState.value = { kind: 'loading' };
  try {
    const { bulletins } = await client.listBulletins();
    listState.value = { kind: 'loaded', bulletins };
  } catch (error) {
    listState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load bulletins.',
    };
  }
}

async function createBulletin(): Promise<void> {
  creating.value = true;
  actionError.value = null;
  try {
    const created = await client.createBulletin();
    await navigateTo(`/bulletins/${created.id}`);
  } catch (error) {
    actionError.value =
      error instanceof ApiRequestError ? error.message : 'Unable to start a bulletin.';
  } finally {
    creating.value = false;
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
  <LayoutPageContainer>
    <LayoutPageHeader
      title="Bulletins"
      description="Newsletters with sections for each organization. Publish one to give it a public page you can share, print or save as a PDF."
    >
      <template v-if="canCreate()" #actions>
        <UiAppButton type="button" :disabled="creating" @click="createBulletin">
          {{ creating ? 'Starting…' : 'New bulletin' }}
        </UiAppButton>
      </template>
    </LayoutPageHeader>

    <UiAlertBanner v-if="actionError">{{ actionError }}</UiAlertBanner>
    <UiLoadingState v-if="listState.kind === 'loading'" message="Loading bulletins…" />
    <UiAlertBanner v-else-if="listState.kind === 'error'">{{ listState.message }}</UiAlertBanner>
    <UiEmptyState
      v-else-if="listState.bulletins.length === 0"
      title="No bulletins yet"
      description="Start one and add a section for each organization’s news."
    >
      <template v-if="canCreate()" #actions>
        <UiAppButton type="button" :disabled="creating" @click="createBulletin"
          >New bulletin</UiAppButton
        >
      </template>
    </UiEmptyState>
    <ul v-else class="bulletin-list">
      <li v-for="bulletin in listState.bulletins" :key="bulletin.id" class="bulletin-list__item">
        <NuxtLink :to="`/bulletins/${bulletin.id}`" class="bulletin-list__link">
          <span class="bulletin-list__title">{{ bulletin.title }}</span>
          <span class="bulletin-list__meta">
            {{ formatDate(bulletin.issueDate) }}, {{ bulletinLanguageName(bulletin.language) }},
            {{ bulletin.sectionCount }} {{ bulletin.sectionCount === 1 ? 'section' : 'sections' }}
          </span>
        </NuxtLink>
        <span
          class="bulletin-list__status"
          :class="`bulletin-list__status--${bulletin.status.toLowerCase()}`"
        >
          {{ bulletin.status === 'Published' ? 'Published' : 'Draft' }}
        </span>
      </li>
    </ul>
  </LayoutPageContainer>
</template>

<style scoped>
.bulletin-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.bulletin-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
}

.bulletin-list__item + .bulletin-list__item {
  border-top: 1px solid var(--color-border);
}

.bulletin-list__link {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  text-decoration: none;
  color: inherit;
}

.bulletin-list__title {
  font-weight: 600;
  color: var(--color-brand);
}

.bulletin-list__link:hover .bulletin-list__title {
  text-decoration: underline;
}

.bulletin-list__meta {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.bulletin-list__status {
  flex: none;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.125rem var(--space-2);
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}

.bulletin-list__status--published {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
</style>
