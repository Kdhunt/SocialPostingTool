<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

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
  <main class="campaign-new-page">
    <h1>Create campaign</h1>
    <p class="campaign-new-page__hint">
      Start with a name and an optional base message. You can add audiences, per-channel text, and images from the
      campaign page after it is created.
    </p>

    <form class="campaign-new-page__form" novalidate @submit.prevent="onSubmit">
      <label for="campaign-name">Campaign name</label>
      <input id="campaign-name" v-model="name" type="text" required />

      <label for="campaign-base-message">Base message (optional)</label>
      <textarea id="campaign-base-message" v-model="baseMessage" rows="4"></textarea>

      <p v-if="errorMessage" role="alert" class="campaign-new-page__error">{{ errorMessage }}</p>

      <button type="submit" :disabled="submitting">{{ submitting ? 'Creating…' : 'Create draft' }}</button>
    </form>
  </main>
</template>

<style scoped>
.campaign-new-page {
  max-width: 32rem;
  margin: 2rem auto;
  padding: 0 1rem;
}

.campaign-new-page__hint {
  color: #57606a;
}

.campaign-new-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 1rem;
}

.campaign-new-page__form label {
  font-weight: 600;
  margin-top: 0.5rem;
}

.campaign-new-page__form input,
.campaign-new-page__form textarea {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-size: 1rem;
  font-family: inherit;
}

.campaign-new-page__form button {
  margin-top: 1rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  border: none;
  background-color: #0969da;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.campaign-new-page__error {
  color: #cf222e;
  font-weight: 600;
}

input:focus-visible,
textarea:focus-visible,
button:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
