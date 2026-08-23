<script setup lang="ts">
definePageMeta({ layout: 'guest' });

const { state, login, submitTotp, submitWardCode } = useAuth();

const username = ref('');
const password = ref('');
const totpCode = ref('');
const wardCode = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

const needsTotp = computed(() => state.value.kind === 'totp_required');

async function finishWithWardCodeIfNeeded(): Promise<{ ok: boolean; error?: string }> {
  if (state.value.kind !== 'ward_code_required') {
    return { ok: true };
  }

  const code = wardCode.value.trim();
  if (!code) {
    return { ok: false, error: 'Enter the ward code to finish signing in.' };
  }

  return submitWardCode(code);
}

async function onLoginSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;

  let result: { ok: boolean; error?: string };

  if (state.value.kind === 'ward_code_required') {
    result = await finishWithWardCodeIfNeeded();
  } else {
    result = await login(username.value, password.value);
    if (result.ok) {
      result = await finishWithWardCodeIfNeeded();
    }
  }

  submitting.value = false;

  if (!result.ok) {
    errorMessage.value = result.error ?? 'Unable to sign in.';
    return;
  }

  if (state.value.kind === 'authenticated') {
    await navigateTo('/');
  }
}

async function onTotpSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;

  let result = await submitTotp(totpCode.value);
  if (result.ok) {
    result = await finishWithWardCodeIfNeeded();
  }

  submitting.value = false;

  if (!result.ok) {
    errorMessage.value = result.error ?? 'Unable to verify authenticator code.';
    return;
  }

  if (state.value.kind === 'authenticated') {
    await navigateTo('/');
  }
}
</script>

<template>
  <div class="login">
    <h1 class="login__title">Sign in</h1>
    <p class="login__lead">Use your ward account credentials to continue.</p>

    <form
      v-if="!needsTotp"
      class="login__form"
      novalidate
      @submit.prevent="onLoginSubmit"
    >
      <UiFormField label="Username" input-id="username">
        <input id="username" v-model="username" class="form-control" type="text" autocomplete="username" required />
      </UiFormField>

      <UiFormField label="Password" input-id="password">
        <input id="password" v-model="password" class="form-control" type="password" autocomplete="current-password" required />
      </UiFormField>

      <UiFormField
        label="Ward code"
        input-id="ward-code"
        hint="Required on this device until the current ward code has been verified."
      >
        <input id="ward-code" v-model="wardCode" class="form-control" type="password" autocomplete="off" />
      </UiFormField>

      <UiAlertBanner v-if="errorMessage">{{ errorMessage }}</UiAlertBanner>

      <UiAppButton type="submit" :disabled="submitting" class="login__submit">
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </UiAppButton>
    </form>

    <form v-else class="login__form" novalidate @submit.prevent="onTotpSubmit">
      <UiAlertBanner tone="info">
        Enter the 6-digit code from your authenticator app.
      </UiAlertBanner>

      <UiFormField label="Authenticator code" input-id="totp-code" hint="Codes refresh every 30 seconds.">
        <input
          id="totp-code"
          v-model="totpCode"
          class="form-control"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="\d{6}"
          maxlength="6"
          required
        />
      </UiFormField>

      <UiAlertBanner v-if="errorMessage">{{ errorMessage }}</UiAlertBanner>

      <UiAppButton type="submit" :disabled="submitting" class="login__submit">
        {{ submitting ? 'Verifying…' : 'Verify code' }}
      </UiAppButton>
    </form>
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
