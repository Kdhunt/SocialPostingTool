<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const name = ref('');
const description = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
  }
});

async function onSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  try {
    const audience = await client.createAudience({
      name: name.value,
      description: description.value || undefined,
    });
    await navigateTo(`/audiences/${audience.id}`);
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : 'Unable to create audience.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="audience-new-page">
    <h1>Create audience</h1>
    <p class="audience-new-page__hint">
      Name this audience however makes sense for your ward — there is nothing built in for specific
      organizations, so choose whatever name fits.
    </p>

    <form class="audience-new-page__form" novalidate @submit.prevent="onSubmit">
      <label for="audience-name">Audience name</label>
      <input id="audience-name" v-model="name" type="text" required />

      <label for="audience-description">Description (optional)</label>
      <textarea id="audience-description" v-model="description" rows="3"></textarea>

      <p v-if="errorMessage" role="alert" class="audience-new-page__error">{{ errorMessage }}</p>

      <button type="submit" :disabled="submitting">{{ submitting ? 'Saving…' : 'Save' }}</button>
    </form>
  </main>
</template>

<style scoped>
.audience-new-page {
  max-width: 28rem;
  margin: 2rem auto;
  padding: 0 1rem;
}

.audience-new-page__hint {
  color: #57606a;
}

.audience-new-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 1rem;
}

.audience-new-page__form label {
  font-weight: 600;
  margin-top: 0.5rem;
}

.audience-new-page__form input,
.audience-new-page__form textarea {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-size: 1rem;
  font-family: inherit;
}

.audience-new-page__form button {
  margin-top: 1rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  border: none;
  background-color: #0969da;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.audience-new-page__error {
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
