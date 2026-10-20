<script setup lang="ts">
definePageMeta({ layout: 'guest' });

const { state, login, submitTotp } = useAuth();

const unitCode = ref('');
const username = ref('');
const password = ref('');
const totpCode = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

const needsTotp = computed(() => state.value.kind === 'totp_required');

function syncLoginFieldsFromForm(form: HTMLFormElement): void {
  const data = new FormData(form);
  const nextUsername = String(data.get('username') ?? '').trim();
  const nextPassword = String(data.get('password') ?? '');
  if (nextUsername) {
    username.value = nextUsername;
  }
  if (nextPassword) {
    password.value = nextPassword;
  }
  unitCode.value = String(data.get('unit-code') ?? '');
}

async function onLoginSubmit(event: Event): Promise<void> {
  if (event.target instanceof HTMLFormElement) {
    syncLoginFieldsFromForm(event.target);
  }

  errorMessage.value = null;
  submitting.value = true;
  const result = await login(username.value, password.value, unitCode.value);
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
  const result = await submitTotp(totpCode.value);
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
    <p class="login__lead">
      Enter your unit code (from your ward, stake, region or district), then your username and password.
    </p>

    <form
      v-if="!needsTotp"
      class="login__form"
      novalidate
      @submit.prevent="onLoginSubmit"
    >
      <UiFormField
        label="Unit code"
        input-id="unit-code"
        hint="Your ward, stake, region or district code. Superadmin leaves this blank."
      >
        <input
          id="unit-code"
          v-model="unitCode"
          name="unit-code"
          class="form-control"
          type="password"
          autocomplete="off"
          spellcheck="false"
        />
      </UiFormField>

      <UiFormField label="Username" input-id="username">
        <input
          id="username"
          v-model="username"
          name="username"
          class="form-control"
          type="text"
          autocomplete="username"
          required
        />
      </UiFormField>

      <UiFormField label="Password" input-id="password">
        <input
          id="password"
          v-model="password"
          name="password"
          class="form-control"
          type="password"
          autocomplete="current-password"
          required
        />
      </UiFormField>

      <UiAlertBanner v-if="errorMessage">{{ errorMessage }}</UiAlertBanner>

      <UiAppButton type="submit" :disabled="submitting" class="login__submit">
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </UiAppButton>

      <p class="login__forgot">
        <NuxtLink to="/forgot-password">Forgot password?</NuxtLink>
      </p>
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

.login__forgot {
  margin: 0;
  text-align: center;
}
</style>
