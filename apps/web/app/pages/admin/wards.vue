<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import {
  createWardRequestSchema,
  fieldErrorsFromUnknown,
  fieldErrorsFromZodError,
  resetPasswordRequestSchema,
  rotateWardCodeRequestSchema,
  type CreateWardRequest,
  type CreateWardResponse,
  type PlatformWardSummaryDto,
} from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; wards: PlatformWardSummaryDto[] };

type CreateWardField = keyof CreateWardRequest;

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const pageState = ref<PageState>({ kind: 'loading' });
const actionError = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const submitting = ref(false);
const createdWard = ref<CreateWardResponse | null>(null);
const fieldErrors = ref<Partial<Record<CreateWardField, string>>>({});

const wardName = ref('');
const timeZone = ref('America/Denver');
const adminUsername = ref('');
const adminEmail = ref('');
const adminDisplayName = ref('');
const adminPassword = ref('');
const initialWardCode = ref('');
const rotateCodes = ref<Record<string, string>>({});
const resetPasswords = ref<Record<string, string>>({});
const wardActionErrors = ref<Record<string, string>>({});
const rotatingWardId = ref<string | null>(null);
const resettingAdminId = ref<string | null>(null);

function canManageWards(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('platform.wards.manage');
}

function describedBy(inputId: string, field: CreateWardField, hasHint: boolean): string | undefined {
  const ids: string[] = [];
  if (hasHint) ids.push(`${inputId}-hint`);
  if (fieldErrors.value[field]) ids.push(`${inputId}-error`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function applyFieldErrors(errors: Record<string, string>): void {
  fieldErrors.value = errors;
  actionError.value = 'Fix the highlighted fields and try again.';
}

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const { wards } = await client.listWards();
    pageState.value = { kind: 'loaded', wards };
  } catch (error) {
    pageState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load wards.',
    };
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  if (!canManageWards()) {
    await navigateTo('/');
    return;
  }
  await load();
});

async function createWard(): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  createdWard.value = null;
  fieldErrors.value = {};

  const payload: CreateWardRequest = {
    name: wardName.value.trim(),
    timeZone: timeZone.value.trim() || undefined,
    adminUsername: adminUsername.value.trim(),
    adminEmail: adminEmail.value,
    adminDisplayName: adminDisplayName.value.trim(),
    adminPassword: adminPassword.value,
    initialWardCode: initialWardCode.value,
  };

  const parsed = createWardRequestSchema.safeParse(payload);
  if (!parsed.success) {
    applyFieldErrors(fieldErrorsFromZodError(parsed.error));
    return;
  }

  submitting.value = true;

  try {
    const result = await client.createWard(parsed.data);

    createdWard.value = result;
    successMessage.value = `Ward "${result.ward.name}" was created. Share the admin credentials and ward code securely with the new ward administrator.`;
    wardName.value = '';
    adminUsername.value = '';
    adminEmail.value = '';
    adminDisplayName.value = '';
    adminPassword.value = '';
    initialWardCode.value = '';
    await load();
  } catch (error) {
    const zodFields = fieldErrorsFromUnknown(error);
    if (zodFields && Object.keys(zodFields).length > 0) {
      applyFieldErrors(zodFields);
    } else {
      actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to create ward.';
    }
  } finally {
    submitting.value = false;
  }
}

async function rotateWardCode(wardId: string): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  const codeKey = `code:${wardId}`;
  const nextCodeErrors = { ...wardActionErrors.value };
  delete nextCodeErrors[codeKey];
  wardActionErrors.value = nextCodeErrors;

  const parsed = rotateWardCodeRequestSchema.safeParse({ newWardCode: rotateCodes.value[wardId] ?? '' });
  if (!parsed.success) {
    wardActionErrors.value = {
      ...wardActionErrors.value,
      [codeKey]: fieldErrorsFromZodError(parsed.error).newWardCode ?? 'Ward code must be at least 4 characters.',
    };
    actionError.value = 'Fix the highlighted fields and try again.';
    return;
  }

  rotatingWardId.value = wardId;
  try {
    await client.rotateWardCodeForWard(wardId, parsed.data.newWardCode);
    rotateCodes.value = { ...rotateCodes.value, [wardId]: '' };
    successMessage.value = 'Ward code rotated. Members of that ward must enter the new code on their next sign-in.';
  } catch (error) {
    const zodFields = fieldErrorsFromUnknown(error);
    if (zodFields?.newWardCode) {
      wardActionErrors.value = { ...wardActionErrors.value, [codeKey]: zodFields.newWardCode };
      actionError.value = 'Fix the highlighted fields and try again.';
    } else {
      actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to rotate ward code.';
    }
  } finally {
    rotatingWardId.value = null;
  }
}

async function resetAdminPassword(wardId: string, userId: string): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  const passwordKey = `password:${userId}`;
  const nextPasswordErrors = { ...wardActionErrors.value };
  delete nextPasswordErrors[passwordKey];
  wardActionErrors.value = nextPasswordErrors;

  const parsed = resetPasswordRequestSchema.safeParse({ password: resetPasswords.value[userId] ?? '' });
  if (!parsed.success) {
    wardActionErrors.value = {
      ...wardActionErrors.value,
      [passwordKey]: fieldErrorsFromZodError(parsed.error).password ?? 'Password must be at least 12 characters.',
    };
    actionError.value = 'Fix the highlighted fields and try again.';
    return;
  }

  resettingAdminId.value = userId;
  try {
    await client.resetWardAdminPassword(wardId, userId, parsed.data.password);
    resetPasswords.value = { ...resetPasswords.value, [userId]: '' };
    successMessage.value = 'Ward administrator password reset. Share the new password securely; it cannot be shown again.';
  } catch (error) {
    const zodFields = fieldErrorsFromUnknown(error);
    if (zodFields?.password) {
      wardActionErrors.value = { ...wardActionErrors.value, [passwordKey]: zodFields.password };
      actionError.value = 'Fix the highlighted fields and try again.';
    } else {
      actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to reset the administrator password.';
    }
  } finally {
    resettingAdminId.value = null;
  }
}
</script>

<template>
  <main class="admin-page">
    <h1>Ward provisioning</h1>
    <p class="admin-page__intro">
      Platform operators can create ward tenants, rotate any ward’s shared code, and reset ward administrator
      passwords. Each ward gets its own admin account and hashed ward code.
    </p>

    <p v-if="pageState.kind === 'loading'">Loading…</p>
    <UiAlertBanner v-if="pageState.kind === 'error'">{{ pageState.message }}</UiAlertBanner>
    <UiAlertBanner v-if="actionError">{{ actionError }}</UiAlertBanner>
    <UiAlertBanner v-if="successMessage" tone="success">{{ successMessage }}</UiAlertBanner>

    <section v-if="createdWard" class="admin-page__success" aria-live="polite">
      <h2>New ward created</h2>
      <p><strong>Ward:</strong> {{ createdWard.ward.name }}</p>
      <p><strong>Admin username:</strong> {{ createdWard.adminUsername }}</p>
      <p><strong>Admin email:</strong> {{ createdWard.adminEmail }}</p>
      <p class="admin-page__hint">
        Store the password and ward code you entered in a secure channel. They cannot be retrieved from this screen.
      </p>
    </section>

    <section aria-labelledby="create-ward-heading">
      <h2 id="create-ward-heading">Create ward</h2>
      <form class="admin-page__form" novalidate @submit.prevent="createWard">
        <UiFormField
          label="Ward name"
          input-id="ward-name"
          hint="Must be unique among active wards."
          :error="fieldErrors.name"
        >
          <input
            id="ward-name"
            v-model="wardName"
            class="form-control"
            type="text"
            required
            autocomplete="off"
            :aria-invalid="fieldErrors.name ? true : undefined"
            :aria-describedby="describedBy('ward-name', 'name', true)"
          />
        </UiFormField>

        <UiFormField
          label="Time zone"
          input-id="ward-time-zone"
          hint="IANA time zone, for example America/Denver."
          :error="fieldErrors.timeZone"
        >
          <input
            id="ward-time-zone"
            v-model="timeZone"
            class="form-control"
            type="text"
            required
            autocomplete="off"
            :aria-invalid="fieldErrors.timeZone ? true : undefined"
            :aria-describedby="describedBy('ward-time-zone', 'timeZone', true)"
          />
        </UiFormField>

        <UiFormField label="Initial admin username" input-id="admin-username" :error="fieldErrors.adminUsername">
          <input
            id="admin-username"
            v-model="adminUsername"
            class="form-control"
            type="text"
            required
            autocomplete="off"
            :aria-invalid="fieldErrors.adminUsername ? true : undefined"
            :aria-describedby="describedBy('admin-username', 'adminUsername', false)"
          />
        </UiFormField>

        <UiFormField
          label="Initial admin email"
          input-id="admin-email"
          hint="Required. Stored lowercase and unique within the new ward."
          :error="fieldErrors.adminEmail"
        >
          <input
            id="admin-email"
            v-model="adminEmail"
            class="form-control"
            type="email"
            required
            autocomplete="off"
            :aria-invalid="fieldErrors.adminEmail ? true : undefined"
            :aria-describedby="describedBy('admin-email', 'adminEmail', true)"
          />
        </UiFormField>

        <UiFormField
          label="Initial admin display name"
          input-id="admin-display-name"
          :error="fieldErrors.adminDisplayName"
        >
          <input
            id="admin-display-name"
            v-model="adminDisplayName"
            class="form-control"
            type="text"
            required
            autocomplete="off"
            :aria-invalid="fieldErrors.adminDisplayName ? true : undefined"
            :aria-describedby="describedBy('admin-display-name', 'adminDisplayName', false)"
          />
        </UiFormField>

        <UiFormField
          label="Initial admin password"
          input-id="admin-password"
          hint="Minimum 12 characters."
          :error="fieldErrors.adminPassword"
        >
          <input
            id="admin-password"
            v-model="adminPassword"
            class="form-control"
            type="password"
            required
            autocomplete="new-password"
            :aria-invalid="fieldErrors.adminPassword ? true : undefined"
            :aria-describedby="describedBy('admin-password', 'adminPassword', true)"
          />
        </UiFormField>

        <UiFormField
          label="Initial ward code"
          input-id="initial-ward-code"
          hint="Shared by all members of this ward. It is stored only as a hash and cannot be shown again."
          :error="fieldErrors.initialWardCode"
        >
          <input
            id="initial-ward-code"
            v-model="initialWardCode"
            class="form-control"
            type="password"
            required
            autocomplete="new-password"
            :aria-invalid="fieldErrors.initialWardCode ? true : undefined"
            :aria-describedby="describedBy('initial-ward-code', 'initialWardCode', true)"
          />
        </UiFormField>

        <UiAppButton type="submit" :disabled="submitting">
          {{ submitting ? 'Creating…' : 'Create ward' }}
        </UiAppButton>
      </form>
    </section>

    <section v-if="pageState.kind === 'loaded'" aria-labelledby="wards-heading">
      <h2 id="wards-heading">Active wards</h2>
      <UiEmptyState v-if="pageState.wards.length === 0" title="No wards yet" description="Create the first ward using the form above." />
      <ul v-else class="admin-page__list">
        <li v-for="ward in pageState.wards" :key="ward.id">
          <strong>{{ ward.name }}</strong>
          <span class="admin-page__hint">{{ ward.timeZone }}</span>
          <span class="admin-page__hint">Created {{ new Date(ward.createdAt).toLocaleString() }}</span>

          <p v-if="ward.admins.length === 0" class="admin-page__hint">No WardAdmin accounts on this ward.</p>
          <ul v-else class="admin-page__admins">
            <li v-for="admin in ward.admins" :key="admin.id">
              <span>{{ admin.displayName }} (@{{ admin.username }})</span>
              <span v-if="admin.email" class="admin-page__hint">{{ admin.email }}</span>
              <form class="admin-page__inline-form" novalidate @submit.prevent="resetAdminPassword(ward.id, admin.id)">
                <UiFormField
                  :label="`New password for ${admin.username}`"
                  :input-id="`reset-password-${admin.id}`"
                  hint="Minimum 12 characters. Sessions for this administrator are revoked."
                  :error="wardActionErrors[`password:${admin.id}`]"
                >
                  <input
                    :id="`reset-password-${admin.id}`"
                    v-model="resetPasswords[admin.id]"
                    class="form-control"
                    type="password"
                    required
                    autocomplete="new-password"
                    :aria-invalid="wardActionErrors[`password:${admin.id}`] ? true : undefined"
                    :aria-describedby="
                      wardActionErrors[`password:${admin.id}`]
                        ? `reset-password-${admin.id}-hint reset-password-${admin.id}-error`
                        : `reset-password-${admin.id}-hint`
                    "
                  />
                </UiFormField>
                <UiAppButton type="submit" :disabled="resettingAdminId === admin.id">
                  {{ resettingAdminId === admin.id ? 'Resetting…' : 'Reset password' }}
                </UiAppButton>
              </form>
            </li>
          </ul>

          <form class="admin-page__inline-form" novalidate @submit.prevent="rotateWardCode(ward.id)">
            <UiFormField
              label="New ward code"
              :input-id="`rotate-code-${ward.id}`"
              hint="At least 4 characters. Members must re-enter the code after rotation."
              :error="wardActionErrors[`code:${ward.id}`]"
            >
              <input
                :id="`rotate-code-${ward.id}`"
                v-model="rotateCodes[ward.id]"
                class="form-control"
                type="password"
                required
                autocomplete="new-password"
                :aria-invalid="wardActionErrors[`code:${ward.id}`] ? true : undefined"
                :aria-describedby="
                  wardActionErrors[`code:${ward.id}`]
                    ? `rotate-code-${ward.id}-hint rotate-code-${ward.id}-error`
                    : `rotate-code-${ward.id}-hint`
                "
              />
            </UiFormField>
            <UiAppButton type="submit" :disabled="rotatingWardId === ward.id">
              {{ rotatingWardId === ward.id ? 'Rotating…' : 'Rotate ward code' }}
            </UiAppButton>
          </form>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 40rem;
}

.admin-page__intro {
  color: var(--color-text-muted);
}

.admin-page__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-page__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-page__list li {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.admin-page__hint {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.admin-page__success {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.admin-page__admins {
  list-style: none;
  margin: var(--space-3) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-page__inline-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
</style>
