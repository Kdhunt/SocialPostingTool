<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useHead, useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { PublicBulletinDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { bulletinLanguageName } from '~/utils/bulletin-languages';
import type { BulletinDocumentModel } from '~/utils/bulletin-document';

definePageMeta({ layout: 'bulletin' });

/**
 * A published bulletin at /{publicSlug}/{bulletinId}. Anonymous; the API
 * serves only published bulletins. "Save as PDF" uses the browser's print
 * dialog with print styles that leave only the newsletter.
 */
const route = useRoute();
const client = useApiClient();

const slug = computed(() =>
  String(route.params.wardSlug ?? '')
    .trim()
    .toLowerCase(),
);
const bulletinId = computed(() => String(route.params.bulletinId ?? ''));
const loading = ref(true);
const notFound = ref(false);
const errorMessage = ref<string | null>(null);
const bulletin = ref<PublicBulletinDto | null>(null);
const pageUrl = ref<string | null>(null);

const model = computed<BulletinDocumentModel | null>(() =>
  bulletin.value
    ? {
        title: bulletin.value.title,
        kicker: bulletin.value.kicker,
        issueDate: bulletin.value.issueDate,
        language: bulletin.value.language,
        template: bulletin.value.template,
        sections: bulletin.value.sections.map((section) => ({ ...section, key: section.id })),
      }
    : null,
);

const otherEditions = computed(
  () => bulletin.value?.editions.filter((edition) => edition.id !== bulletin.value?.id) ?? [],
);
const isSpanish = computed(() => bulletin.value?.language.startsWith('es') ?? false);

useHead(() => ({
  title: bulletin.value ? `${bulletin.value.title} | ${bulletin.value.unitName}` : 'Bulletin',
}));

async function load(): Promise<void> {
  loading.value = true;
  notFound.value = false;
  errorMessage.value = null;
  bulletin.value = null;
  if (!/^[a-z0-9]{2,64}$/.test(slug.value) || bulletinId.value.length === 0) {
    notFound.value = true;
    loading.value = false;
    return;
  }
  try {
    bulletin.value = await client.getPublicBulletin(slug.value, bulletinId.value);
    pageUrl.value = `${window.location.origin}/${slug.value}/${bulletinId.value}`;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound.value = true;
    } else {
      errorMessage.value =
        error instanceof ApiRequestError ? error.message : 'Unable to load this bulletin.';
    }
  } finally {
    loading.value = false;
  }
}

function savePdf(): void {
  window.print();
}

onMounted(() => {
  void load();
});

watch([slug, bulletinId], () => {
  void load();
});
</script>

<template>
  <div class="public-bulletin">
    <UiLoadingState v-if="loading" message="Loading bulletin…" />

    <template v-else-if="notFound">
      <LayoutPageHeader
        title="Bulletin not found"
        description="It may have been unpublished, or the link is incomplete."
      />
      <p><NuxtLink :to="`/${slug}`">See this unit’s page</NuxtLink></p>
    </template>

    <UiAlertBanner v-else-if="errorMessage">{{ errorMessage }}</UiAlertBanner>

    <template v-else-if="bulletin && model">
      <div class="public-bulletin__bar">
        <NuxtLink :to="`/${slug}`">{{ bulletin.unitName }}</NuxtLink>
        <div class="public-bulletin__actions">
          <NuxtLink
            v-for="edition in otherEditions"
            :key="edition.id"
            :to="`/${slug}/${edition.id}`"
            :lang="edition.language"
            class="public-bulletin__edition"
          >
            {{ bulletinLanguageName(edition.language) }}
          </NuxtLink>
          <UiAppButton type="button" variant="secondary" @click="savePdf">
            {{ isSpanish ? 'Guardar como PDF' : 'Save as PDF' }}
          </UiAppButton>
        </div>
      </div>
      <div class="public-bulletin__paper print-root">
        <BulletinDocument :bulletin="model" :page-url="pageUrl" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.public-bulletin__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.public-bulletin__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.public-bulletin__paper {
  border: 1px solid var(--color-border);
  box-shadow: 0 1px 3px rgb(26 35 50 / 0.12);
  background: #ffffff;
}

@media print {
  .public-bulletin__paper {
    border: 0;
    box-shadow: none;
  }
}
</style>
