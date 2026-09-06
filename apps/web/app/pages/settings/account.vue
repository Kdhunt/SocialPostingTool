<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import {
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  fieldErrorsFromUnknown,
  fieldErrorsFromZodError,
  type ChangeEmailRequest,
  type ChangePasswordRequest,
} from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const pageError = ref<string | null>(null);
const emailSuccess = ref<string | null>(null);
const passwordSuccess = ref<string | null>(null);
const emailFieldErrors = ref<Partial<Record<keyof ChangeEmailRequest, string>>>({});
const passwordFieldErrors = ref<Partial<Record<keyof ChangePasswordRequest, string>>>({});
const emailValue = ref('');
const currentPassword = ref('');
const newPassword = ref('');
const emailSubmitting = ref(false);
const passwordSubmitting = ref(false);
const resending = ref(false);

const signedInUser = computed(() => (authState.value.kind === 'authenticated' ? authState.value.user : null));
const verificationLabel = computed(() => {
  if (!signedInUser.value?.email) {
    return 'No email on this account';
  }
  return signedInUser.value.emailVerifiedAt ? 'Email confirmed' : 'Email unconfirmed';
});

function describedBy(inputId: string, error?: string, hasHint = false): string | undefined {
  const ids: string[] = [];
  if (hasHint) ids.push(`${inputId}-hint`);
  if (error) ids.push(`${inputId}-error`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  emailValue.value = signedInUser.value?.email ?? '';
});

async function changeEmail(): Promise<void> {
  pageError.value = null;
  emailSuccess.value = null;
  emailFieldErrors.value = {};

  const parsed = changeEmailRequestSchema.safeParse({ email: emailValue.value });
  if (!parsed.success) {
    emailFieldErrors.value = fieldErrorsFromZodError(parsed.error);
    return;
  }

  emailSubmitting.value = true;
  try {
    const result = await client.changeOwnEmail(parsed.data);
    emailSuccess.value = result.message;
    await refreshSession();
    emailValue.value = result.email;
  } catch (error) {
    const zodFields = fieldErrorsFromUnknown(error);
    if (zodFields && Object.keys(zodFields).length > 0) {
      emailFieldErrors.value = zodFields;
    } else {
      pageError.value = error instanceof ApiRequestError ? error.message : 'Unable to update email.';
    }
  } finally {
    emailSubmitting.value = false;
  }
}

async function changePassword(): Promise<void> {
  pageError.value = null;
  passwordSuccess.value = null;
  passwordFieldErrors.value = {};

  const parsed = changePasswordRequestSchema.safeParse({
    currentPassword: currentPassword.value,
    newPassword: newPassword.value,
  });
  if (!parsed.success) {
    passwordFieldErrors.value = fieldErrorsFromZodError(parsed.error);
    return;
  }

  passwordSubmitting.value = true;
  try {
    await client.changeOwnPassword(parsed.data);
    currentPassword.value = '';
    newPassword.value = '';
    passwordSuccess.value = 'Password updated. Sign in again to continue.';
    await refreshSession();
    if (authState.value.kind === 'anonymous') {
      await navigateTo('/login');
    }
  } catch (error) {
    const zodFields = fieldErrorsFromUnknown(error);
    if (zodFields && Object.keys(zodFields).length > 0) {
      passwordFieldErrors.value = zodFields;
    } else {
      pageError.value = error instanceof ApiRequestError ? error.message : 'Unable to update password.';
    }
  } finally {
    passwordSubmitting.value = false;
  }
}

async function resendVerification(): Promise<void> {
  pageError.value = null;
  emailSuccess.value = null;
  resending.value = true;
  try {
    await client.resendOwnVerificationEmail();
    emailSuccess.value = 'A confirmation email was queued for your inbox.';
  } catch (error) {
    pageError.value = error instanceof ApiRequestError ? error.message : 'Unable to send a confirmation email.';
  } finally {
    resending.value = false;
  }
}
</script>

<template>
  <LayoutPageContainer>
    <LayoutPageHeader
      title="Account"
      description="Update the email and password on your sign-in account. We never email a password."
    />

    <p v-if="!signedInUser">Loading…</p>
    <UiAlertBanner v-if="pageError">{{ pageError }}</UiAlertBanner>

    <template v-if="signedInUser">
      <section class="account-section" aria-labelledby="email-status-heading">
        <h2 id="email-status-heading">Email status</h2>
        <p class="account-section__hint">
          Signed in as <strong>{{ signedInUser.displayName }}</strong> (@{{ signedInUser.username }}).
        </p>
        <p v-if="signedInUser.email" class="account-section__email">{{ signedInUser.email }}</p>
        <p class="account-section__status" :class="{ 'account-section__status--ok': signedInUser.emailVerifiedAt }">
          {{ verificationLabel }}
        </p>
        <UiAppButton
          v-if="signedInUser.email && !signedInUser.emailVerifiedAt"
          type="button"
          variant="secondary"
          :disabled="resending"
          @click="resendVerification"
        >
          {{ resending ? 'Sending…' : 'Resend confirmation email' }}
        </UiAppButton>
        <UiAlertBanner v-if="emailSuccess" tone="success">{{ emailSuccess }}</UiAlertBanner>
      </section>

      <section class="account-section" aria-labelledby="change-email-heading">
        <h2 id="change-email-heading">Change email</h2>
        <p class="account-section__hint">
          The new address must be unique in this ward. Confirmation is cleared until you verify the inbox.
        </p>
        <form class="account-section__form" novalidate @submit.prevent="changeEmail">
          <UiFormField
            label="Email"
            input-id="account-email"
            hint="Stored lowercase and unique within your ward."
            :error="emailFieldErrors.email"
          >
            <input
              id="account-email"
              v-model="emailValue"
              class="form-control"
              type="email"
              autocomplete="email"
              required
              :aria-invalid="emailFieldErrors.email ? true : undefined"
              :aria-describedby="describedBy('account-email', emailFieldErrors.email, true)"
            />
          </UiFormField>
          <UiAppButton type="submit" :disabled="emailSubmitting">
            {{ emailSubmitting ? 'Saving…' : 'Update email' }}
          </UiAppButton>
        </form>
      </section>

      <section class="account-section" aria-labelledby="change-password-heading">
        <h2 id="change-password-heading">Change password</h2>
        <p class="account-section__hint">
          Enter your current password and a new one (at least 12 characters). All sessions will be signed out.
        </p>
        <UiAlertBanner v-if="passwordSuccess" tone="success">{{ passwordSuccess }}</UiAlertBanner>
        <form class="account-section__form" novalidate @submit.prevent="changePassword">
          <UiFormField label="Current password" input-id="current-password" :error="passwordFieldErrors.currentPassword">
            <input
              id="current-password"
              v-model="currentPassword"
              class="form-control"
              type="password"
              autocomplete="current-password"
              required
              :aria-invalid="passwordFieldErrors.currentPassword ? true : undefined"
              :aria-describedby="describedBy('current-password', passwordFieldErrors.currentPassword)"
            />
          </UiFormField>
          <UiFormField
            label="New password"
            input-id="new-password"
            hint="Minimum 12 characters, with a letter and a number."
            :error="passwordFieldErrors.newPassword"
          >
            <input
              id="new-password"
              v-model="newPassword"
              class="form-control"
              type="password"
              autocomplete="new-password"
              required
              :aria-invalid="passwordFieldErrors.newPassword ? true : undefined"
              :aria-describedby="describedBy('new-password', passwordFieldErrors.newPassword, true)"
            />
          </UiFormField>
          <UiAppButton type="submit" :disabled="passwordSubmitting">
            {{ passwordSubmitting ? 'Saving…' : 'Update password' }}
          </UiAppButton>
        </form>
      </section>

      <p class="account-section__hint">
        <NuxtLink to="/settings/security">Two-factor authentication</NuxtLink>
      </p>
    </template>
  </LayoutPageContainer>
</template>

<style scoped>
.account-section {
  margin-top: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 32rem;
}

.account-section__hint {
  color: var(--color-text-muted);
}

.account-section__email {
  font-weight: 600;
  word-break: break-all;
}

.account-section__status {
  display: inline-block;
  width: fit-content;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--color-warning-soft);
  border: 1px solid var(--color-warning);
}

.account-section__status--ok {
  background: var(--color-success-soft);
  border-color: var(--color-success);
}

.account-section__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
