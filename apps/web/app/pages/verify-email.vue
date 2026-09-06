<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import { useApiClient } from '~/composables/useApiClient';

definePageMeta({ layout: 'guest' });

const route = useRoute();
const client = useApiClient();
const status = ref<'working' | 'ok' | 'error'>('working');
const message = ref('Confirming your email…');

onMounted(async () => {
  const token = String(route.query.token ?? '');
  if (!token) {
    status.value = 'error';
    message.value = 'This confirmation link is missing a token. Ask an administrator to resend the email.';
    return;
  }

  try {
    const result = await client.verifyEmail(token);
    status.value = 'ok';
    message.value = result.message;
  } catch (error) {
    status.value = 'error';
    message.value = error instanceof ApiRequestError ? error.message : 'Unable to confirm this email address.';
  }
});
</script>

<template>
  <div class="login">
    <h1 class="login__title">Confirm email</h1>
    <p class="login__lead" :role="status === 'error' ? 'alert' : undefined">{{ message }}</p>
    <p v-if="status !== 'working'" class="login__lead">
      <NuxtLink to="/login">Continue to sign in</NuxtLink>
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
</style>
