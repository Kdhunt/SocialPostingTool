<script setup lang="ts">
import { ref } from 'vue';
import { navigateTo } from '#imports';
import { useAuth } from '~/composables/useAuth';

const { state, login, submitWardCode } = useAuth();

const username = ref('');
const password = ref('');
const wardCode = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

async function onLoginSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  const result = await login(username.value, password.value);
  submitting.value = false;

  if (!result.ok) {
    errorMessage.value = result.error ?? 'Unable to sign in.';
    return;
  }

  if (state.value.kind === 'authenticated') {
    await navigateTo('/');
  }
}

async function onWardCodeSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  const result = await submitWardCode(wardCode.value);
  submitting.value = false;

  if (!result.ok) {
    errorMessage.value = result.error ?? 'Unable to verify ward code.';
    return;
  }

  await navigateTo('/');
}
</script>

<template>
  <main class="login-page">
    <h1>Sign in</h1>

    <form
      v-if="state.kind !== 'ward_code_required'"
      class="login-page__form"
      novalidate
      @submit.prevent="onLoginSubmit"
    >
      <label for="username">Username</label>
      <input id="username" v-model="username" type="text" autocomplete="username" required />

      <label for="password">Password</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" required />

      <p v-if="errorMessage" class="login-page__error" role="alert">{{ errorMessage }}</p>

      <button type="submit" :disabled="submitting">{{ submitting ? 'Signing in…' : 'Sign in' }}</button>
    </form>

    <form v-else class="login-page__form" novalidate @submit.prevent="onWardCodeSubmit">
      <p>This device needs the current ward code to finish signing in.</p>

      <label for="ward-code">Ward code</label>
      <input id="ward-code" v-model="wardCode" type="password" autocomplete="off" required />

      <p v-if="errorMessage" class="login-page__error" role="alert">{{ errorMessage }}</p>

      <button type="submit" :disabled="submitting">{{ submitting ? 'Verifying…' : 'Verify ward code' }}</button>
    </form>
  </main>
</template>

<style scoped>
.login-page {
  max-width: 24rem;
  margin: 3rem auto;
  padding: 0 1rem;
}

.login-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}

.login-page__form label {
  font-weight: 600;
}

.login-page__form input {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-size: 1rem;
}

.login-page__form input:focus-visible,
.login-page__form button:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}

.login-page__form button {
  margin-top: 0.5rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  border: none;
  background-color: #0969da;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.login-page__form button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.login-page__error {
  color: #cf222e;
  font-weight: 600;
}
</style>
