<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

import { ApiRequestError } from '@ward-comms/api-client';

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const name = ref('');
const baseMessage = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind !== 'authenticated') {
    await navigateTo('/login');
    return;
  }
  if (!authState.value.user.permissions.includes('campaigns.create')) {
    await navigateTo('/campaigns');
  }
});

async function onSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  try {
    const campaign = await client.createCampaign({
      name: name.value,
      baseMessage: baseMessage.value || undefined,
    });
    await navigateTo(`/campaigns/${campaign.id}`);
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : 'Unable to create campaign.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <LayoutPageContainer narrow>
    <LayoutBreadcrumbs :items="[{ label: 'Campaigns', to: '/campaigns' }, { label: 'New campaign' }]" />

    <LayoutPageHeader
      title="Create campaign"
      description="Start with a name and optional message. You'll add audiences, preview recipients, and request approval on the next screen."
    />

    <form class="form-stack card" novalidate @submit.prevent="onSubmit">
      <UiFormField label="Campaign name" input-id="campaign-name">
        <input id="campaign-name" v-model="name" class="form-control" type="text" required />
      </UiFormField>

      <UiFormField label="Base message (optional)" input-id="campaign-base-message" hint="You can refine this later per channel and audience.">
        <textarea id="campaign-base-message" v-model="baseMessage" class="form-control" rows="5" />
      </UiFormField>

      <UiAlertBanner v-if="errorMessage">{{ errorMessage }}</UiAlertBanner>

      <div class="button-row">
        <UiAppButton type="submit" :disabled="submitting">{{ submitting ? 'Creating…' : 'Create draft' }}</UiAppButton>
        <UiAppButton variant="secondary" to="/campaigns">Cancel</UiAppButton>
      </div>
    </form>
  </LayoutPageContainer>
</template>

<style scoped>
.form-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
