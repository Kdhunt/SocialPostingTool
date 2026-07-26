<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const name = ref('');
const addressLine1 = ref('');
const city = ref('');
const state_ = ref('');
const postalCode = ref('');
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
    const household = await client.createHousehold({
      name: name.value,
      addressLine1: addressLine1.value || undefined,
      city: city.value || undefined,
      state: state_.value || undefined,
      postalCode: postalCode.value || undefined,
    });
    await navigateTo(`/directory/households/${household.id}`);
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : 'Unable to create household.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="household-new-page">
    <h1>Add household</h1>

    <form class="household-new-page__form" novalidate @submit.prevent="onSubmit">
      <label for="household-name">Household name</label>
      <input id="household-name" v-model="name" type="text" required />

      <label for="address-line1">Address (optional)</label>
      <input id="address-line1" v-model="addressLine1" type="text" />

      <label for="city">City</label>
      <input id="city" v-model="city" type="text" />

      <label for="state">State</label>
      <input id="state" v-model="state_" type="text" />

      <label for="postal-code">Postal code</label>
      <input id="postal-code" v-model="postalCode" type="text" />

      <p v-if="errorMessage" role="alert" class="household-new-page__error">{{ errorMessage }}</p>

      <button type="submit" :disabled="submitting">{{ submitting ? 'Saving…' : 'Save' }}</button>
    </form>
  </main>
</template>

<style scoped>
.household-new-page {
  max-width: 28rem;
  margin: 2rem auto;
  padding: 0 1rem;
}

.household-new-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 1rem;
}

.household-new-page__form label {
  font-weight: 600;
  margin-top: 0.5rem;
}

.household-new-page__form input {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-size: 1rem;
}

.household-new-page__form button {
  margin-top: 1rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  border: none;
  background-color: #0969da;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.household-new-page__error {
  color: #cf222e;
  font-weight: 600;
}

input:focus-visible,
button:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
