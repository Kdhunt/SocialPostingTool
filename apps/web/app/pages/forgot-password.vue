<script setup lang="ts">
import { ref } from 'vue';
import { ApiRequestError } from '@ward-comms/api-client';
import { useApiClient } from '~/composables/useApiClient';

definePageMeta({ layout: 'guest' });

const client = useApiClient();
const email = ref('');
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

async function onSubmit(): Promise<void> {
  errorMessage.value = null;
  successMessage.value = null;
  submitting.value = true;
  try {
    const result = await client.requestPasswordReset(email.value);
    successMessage.value = result.message;
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : 'Unable to send a reset email.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login">
    <h1 class="login__title">Reset your password</h1>
    <p class="login__lead">
      Enter the email on your account. If it matches, we will send a reset link. We never email your password.
    </p>

    <form class="login__form" novalidate @submit.prevent="onSubmit">
      <UiFormField label="Email" input-id="reset-email">
        <input
          id="reset-email"
          v-model="email"
          class="form-control"
          type="email"
          autocomplete="email"
          required
        />
      </UiFormField>

      <UiAlertBanner v-if="errorMessage">{{ errorMessage }}</UiAlertBanner>
      <UiAlertBanner v-if="successMessage" tone="success">{{ successMessage }}</UiAlertBanner>

      <UiAppButton type="submit" :disabled="submitting" class="login__submit">
        {{ submitting ? 'Sending…' : 'Email reset link' }}
      </UiAppButton>
    </form>

    <p class="login__lead">
      <NuxtLink to="/login">Back to sign in</NuxtLink>
    </p>
  </div>
</template>

<style scoped>
.login__title {
  font-size: 1.375rem;
  font-weight: 700;
}

.login__lead {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
}

.login__form {
  margin-top: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.login__submit {
  width: 100%;
}
</style>
