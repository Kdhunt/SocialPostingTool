<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import { resetPasswordWithTokenRequestSchema, fieldErrorsFromZodError } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';

definePageMeta({ layout: 'guest' });

const route = useRoute();
const client = useApiClient();
const token = computed(() => String(route.query.token ?? ''));
const password = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

async function onSubmit(): Promise<void> {
  errorMessage.value = null;
  successMessage.value = null;

  if (!token.value) {
    errorMessage.value = 'This reset link is missing a token. Request a new email from the sign-in page.';
    return;
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'The two passwords do not match.';
    return;
  }

  const parsed = resetPasswordWithTokenRequestSchema.safeParse({ token: token.value, password: password.value });
  if (!parsed.success) {
    errorMessage.value = fieldErrorsFromZodError(parsed.error).password ?? 'Enter a stronger password.';
    return;
  }

  submitting.value = true;
  try {
    const result = await client.resetPasswordWithToken(parsed.data.token, parsed.data.password);
    successMessage.value = result.message;
    password.value = '';
    confirmPassword.value = '';
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : 'Unable to update the password.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login">
    <h1 class="login__title">Choose a new password</h1>
    <p class="login__lead">Use the link from your email. The new password is stored as a hash only.</p>

    <form class="login__form" novalidate @submit.prevent="onSubmit">
      <UiFormField label="New password" input-id="new-password" hint="Minimum 12 characters.">
        <input
          id="new-password"
          v-model="password"
          class="form-control"
          type="password"
          autocomplete="new-password"
          required
        />
      </UiFormField>

      <UiFormField label="Confirm password" input-id="confirm-password">
        <input
          id="confirm-password"
          v-model="confirmPassword"
          class="form-control"
          type="password"
          autocomplete="new-password"
          required
        />
      </UiFormField>

      <UiAlertBanner v-if="errorMessage">{{ errorMessage }}</UiAlertBanner>
      <UiAlertBanner v-if="successMessage" tone="success">{{ successMessage }}</UiAlertBanner>

      <UiAppButton type="submit" :disabled="submitting" class="login__submit">
        {{ submitting ? 'Updating…' : 'Update password' }}
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
