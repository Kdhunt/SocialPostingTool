<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { TotpEnrollmentResponse, TotpStatusResponse } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const status = ref<TotpStatusResponse | undefined>(undefined);
const enrollment = ref<TotpEnrollmentResponse | null>(null);
const confirmCode = ref('');
const disablePassword = ref('');
const disableCode = ref('');
const actionError = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const submitting = ref(false);

async function loadStatus(): Promise<void> {
  status.value = undefined;
  actionError.value = null;
  try {
    status.value = await client.getTotpStatus();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to load security settings.';
    status.value = { enabled: false, pendingEnrollment: false };
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  await loadStatus();
});

async function startEnrollment(): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  submitting.value = true;
  try {
    enrollment.value = await client.beginTotpEnrollment();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to start two-factor setup.';
  } finally {
    submitting.value = false;
  }
}

async function confirmEnrollment(): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  submitting.value = true;
  try {
    await client.confirmTotpEnrollment(confirmCode.value);
    enrollment.value = null;
    confirmCode.value = '';
    successMessage.value = 'Two-factor authentication is enabled. Sign in again to continue.';
    await refreshSession();
    if (authState.value.kind === 'anonymous') {
      await navigateTo('/login');
    }
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to confirm two-factor setup.';
  } finally {
    submitting.value = false;
  }
}

async function disableTwoFactor(): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  submitting.value = true;
  try {
    await client.disableTotp(disablePassword.value, disableCode.value);
    disablePassword.value = '';
    disableCode.value = '';
    successMessage.value = 'Two-factor authentication is disabled. Sign in again to continue.';
    await refreshSession();
    if (authState.value.kind === 'anonymous') {
      await navigateTo('/login');
    } else {
      await loadStatus();
    }
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to disable two-factor authentication.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <LayoutPageContainer>
    <LayoutPageHeader
      title="Security"
      description="Protect your account with an authenticator app. You will be asked for a code when signing in."
    />

    <p v-if="status === undefined">Loading…</p>
    <UiAlertBanner v-if="actionError">{{ actionError }}</UiAlertBanner>
    <UiAlertBanner v-if="successMessage" tone="success">{{ successMessage }}</UiAlertBanner>

    <section v-if="status && !status.enabled && !enrollment" class="security-section" aria-labelledby="enable-2fa-heading">
      <h2 id="enable-2fa-heading">Two-factor authentication</h2>
      <p class="security-section__hint">
        Add a second step at sign-in using an app such as Google Authenticator, 1Password, or Authy.
      </p>
      <UiAppButton type="button" :disabled="submitting" @click="startEnrollment">
        {{ submitting ? 'Starting…' : 'Set up authenticator app' }}
      </UiAppButton>
    </section>

    <section v-if="enrollment" class="security-section" aria-labelledby="confirm-2fa-heading">
      <h2 id="confirm-2fa-heading">Scan or enter your setup key</h2>
      <p class="security-section__hint">
        Scan the QR code in your authenticator app, or enter the setup key manually.
      </p>

      <p class="security-section__secret">
        <span class="security-section__secret-label">Setup key:</span>
        <code>{{ enrollment.secret }}</code>
      </p>

      <p class="security-section__hint">
        <a :href="enrollment.otpauthUrl">Open in authenticator app</a>
      </p>

      <form class="security-section__form" novalidate @submit.prevent="confirmEnrollment">
        <UiFormField label="Verification code" input-id="confirm-totp" hint="Enter the 6-digit code shown in your app.">
          <input
            id="confirm-totp"
            v-model="confirmCode"
            class="form-control"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="\d{6}"
            maxlength="6"
            required
          />
        </UiFormField>
        <UiAppButton type="submit" :disabled="submitting">
          {{ submitting ? 'Confirming…' : 'Confirm and enable' }}
        </UiAppButton>
      </form>
    </section>

    <section v-if="status?.enabled" class="security-section" aria-labelledby="disable-2fa-heading">
      <h2 id="disable-2fa-heading">Two-factor authentication is on</h2>
      <p class="security-section__hint">
        Disabling two-factor authentication requires your password and a current authenticator code.
        All active sessions will be signed out.
      </p>

      <form class="security-section__form" novalidate @submit.prevent="disableTwoFactor">
        <UiFormField label="Password" input-id="disable-password">
          <input id="disable-password" v-model="disablePassword" class="form-control" type="password" autocomplete="current-password" required />
        </UiFormField>

        <UiFormField label="Authenticator code" input-id="disable-totp">
          <input
            id="disable-totp"
            v-model="disableCode"
            class="form-control"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="\d{6}"
            maxlength="6"
            required
          />
        </UiFormField>

        <UiAppButton type="submit" variant="danger" :disabled="submitting">
          {{ submitting ? 'Disabling…' : 'Disable two-factor authentication' }}
        </UiAppButton>
      </form>
    </section>
  </LayoutPageContainer>
</template>

<style scoped>
.security-section {
  margin-top: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 32rem;
}

.security-section__hint {
  color: var(--color-text-muted);
}

.security-section__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.security-section__secret {
  word-break: break-all;
}

.security-section__secret-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: var(--space-1);
}
</style>
