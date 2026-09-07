<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { PublicWardBulletinResponse } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';

definePageMeta({ layout: 'bulletin' });

const route = useRoute();
const client = useApiClient();

const slug = computed(() => String(route.params.wardSlug ?? '').trim().toLowerCase());
const loading = ref(true);
const notFound = ref(false);
const errorMessage = ref<string | null>(null);
const bulletin = ref<PublicWardBulletinResponse | null>(null);

function formatPublishedAt(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

async function load(): Promise<void> {
  loading.value = true;
  notFound.value = false;
  errorMessage.value = null;
  bulletin.value = null;
  if (!/^[a-z0-9]{2,64}$/.test(slug.value)) {
    notFound.value = true;
    loading.value = false;
    return;
  }
  try {
    bulletin.value = await client.getPublicWardBulletin(slug.value);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound.value = true;
    } else {
      errorMessage.value = error instanceof ApiRequestError ? error.message : 'Unable to load published campaigns.';
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(slug, () => {
  void load();
});
</script>

<template>
  <article>
    <UiLoadingState v-if="loading" message="Loading published campaigns…" />

    <template v-else-if="notFound">
      <LayoutPageHeader title="Ward page not found" description="This public campaign page does not exist." />
      <p>
        <NuxtLink to="/login">Continue to sign in</NuxtLink>
      </p>
    </template>

    <template v-else-if="errorMessage">
      <LayoutPageHeader title="Unable to load campaigns" />
      <UiAlertBanner>{{ errorMessage }}</UiAlertBanner>
    </template>

    <template v-else-if="bulletin">
      <LayoutPageHeader
        :title="bulletin.wardName"
        description="Published campaigns, newest first. This page does not include drafts or member contact information."
      />

      <UiEmptyState
        v-if="bulletin.campaigns.length === 0"
        title="No published campaigns yet"
        description="When this ward sends a campaign, it will appear here by publish date."
      />

      <ol v-else class="bulletin-list">
        <li v-for="campaign in bulletin.campaigns" :key="campaign.id" class="bulletin-card">
          <h2>{{ campaign.name }}</h2>
          <p class="bulletin-card__meta">
            Published {{ formatPublishedAt(campaign.publishedAt, bulletin.timeZone) }}
          </p>
          <img
            v-if="campaign.imageUrl"
            :src="campaign.imageUrl"
            :alt="campaign.imageAltText || campaign.name"
            class="bulletin-card__image"
          />
          <p v-if="campaign.message" class="bulletin-card__message">{{ campaign.message }}</p>
        </li>
      </ol>
    </template>
  </article>
</template>

<style scoped>
.bulletin-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.bulletin-card {
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.bulletin-card h2 {
  font-size: 1.25rem;
  font-weight: 700;
}

.bulletin-card__meta {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.bulletin-card__message {
  white-space: pre-wrap;
}

.bulletin-card__image {
  width: 100%;
  height: auto;
  border-radius: var(--radius-md);
}
</style>
