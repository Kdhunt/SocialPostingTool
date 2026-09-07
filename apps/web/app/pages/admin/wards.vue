<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
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
const showCreateForm = ref(false);
const expandedWardId = ref<string | null>(null);

const wardName = ref('');
const timeZone = ref('America/Denver');
const adminUsername = ref('');
const adminEmail = ref('');
const adminDisplayName = ref('');
const adminPassword = ref('');
const initialWardCode = ref('');
const publicSlug = ref('');
const rotateCodes = ref<Record<string, string>>({});
const resetPasswords = ref<Record<string, string>>({});
const slugDrafts = ref<Record<string, string>>({});
const savingSlugId = ref<string | null>(null);
const wardActionErrors = ref<Record<string, string>>({});
const rotatingWardId = ref<string | null>(null);
const resettingAdminId = ref<string | null>(null);
const emailingAdminId = ref<string | null>(null);

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

function formatCreatedAt(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
}

function adminNames(ward: PlatformWardSummaryDto): string {
  if (ward.admins.length === 0) {
    return 'No administrators';
  }
  return ward.admins.map((admin) => `${admin.displayName} (@${admin.username})`).join(', ');
}

async function openCreateForm(): Promise<void> {
  showCreateForm.value = true;
  createdWard.value = null;
  await nextTick();
  document.getElementById('ward-name')?.focus();
}

function cancelCreateForm(): void {
  showCreateForm.value = false;
  fieldErrors.value = {};
}

function toggleManage(wardId: string): void {
  expandedWardId.value = expandedWardId.value === wardId ? null : wardId;
}

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const { wards } = await client.listWards();
    slugDrafts.value = Object.fromEntries(wards.map((ward) => [ward.id, ward.publicSlug]));
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
  if (publicSlug.value.trim()) {
    payload.publicSlug = publicSlug.value.trim().toLowerCase();
  }

  const parsed = createWardRequestSchema.safeParse(payload);
  if (!parsed.success) {
    applyFieldErrors(fieldErrorsFromZodError(parsed.error));
    return;
  }

  submitting.value = true;

  try {
    const result = await client.createWard(parsed.data);

    createdWard.value = result;
    successMessage.value = `Ward "${result.ward.name}" was created. Public campaigns appear at /${result.ward.publicSlug}. A confirmation email was queued for ${result.adminEmail}. Share the initial password and ward code securely — they are not emailed.`;
    wardName.value = '';
    adminUsername.value = '';
    adminEmail.value = '';
    adminDisplayName.value = '';
    adminPassword.value = '';
    initialWardCode.value = '';
    publicSlug.value = '';
    showCreateForm.value = false;
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
    successMessage.value = 'Ward administrator password was set. Share it securely; it was not emailed.';
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

async function emailAdminPasswordReset(wardId: string, userId: string, email: string | null): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  emailingAdminId.value = userId;
  try {
    await client.sendWardAdminPasswordResetEmail(wardId, userId);
    successMessage.value = `A password reset email was queued${email ? ` for ${email}` : ''}.`;
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to send a reset email.';
  } finally {
    emailingAdminId.value = null;
  }
}

async function savePublicSlug(wardId: string): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  savingSlugId.value = wardId;
  try {
    const updated = await client.updateWardPublicSlug(wardId, { publicSlug: slugDrafts.value[wardId] ?? '' });
    successMessage.value = `Public campaigns for ${updated.name} now appear at /${updated.publicSlug}.`;
    await load();
  } catch (error) {
    const zodFields = fieldErrorsFromUnknown(error);
    actionError.value =
      zodFields?.publicSlug ??
      (error instanceof ApiRequestError ? error.message : 'Unable to update the public page path.');
  } finally {
    savingSlugId.value = null;
  }
}
</script>

<template>
  <div class="wards">
    <header class="wards__header">
      <div>
        <h2>Wards</h2>
        <p class="wards__lede">
          Each ward is a separate tenant with its own members and campaigns. Connect Facebook under Administration →
          Facebook Page. The public site address is configured in hosting, not on this screen.
        </p>
      </div>
      <UiAppButton v-if="!showCreateForm" type="button" @click="openCreateForm">New ward</UiAppButton>
    </header>

    <UiAlertBanner v-if="pageState.kind === 'error'">{{ pageState.message }}</UiAlertBanner>
    <UiAlertBanner v-if="actionError">{{ actionError }}</UiAlertBanner>
    <UiAlertBanner v-if="successMessage" tone="success">{{ successMessage }}</UiAlertBanner>

    <section v-if="createdWard" class="wards__notice" aria-live="polite">
      <h2>New ward created</h2>
      <p><strong>{{ createdWard.ward.name }}</strong> · public page /{{ createdWard.ward.publicSlug }}</p>
      <p>Admin {{ createdWard.adminUsername }} ({{ createdWard.adminEmail }})</p>
      <p class="wards__hint">The password and ward code cannot be shown again. Store them in a secure channel.</p>
    </section>

    <section v-if="showCreateForm" class="wards__panel" aria-labelledby="create-ward-heading">
      <div class="wards__panel-head">
        <h2 id="create-ward-heading">Create ward</h2>
        <UiAppButton variant="ghost" type="button" @click="cancelCreateForm">Cancel</UiAppButton>
      </div>
      <form class="wards__form" novalidate @submit.prevent="createWard">
        <UiFormField label="Ward name" input-id="ward-name" hint="Must be unique among active wards." :error="fieldErrors.name">
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

        <div class="wards__form-grid">
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

          <UiFormField
            label="Public page path (optional)"
            input-id="public-slug"
            hint="Letters and numbers only, for example grangecreek. Not the login ward code."
            :error="fieldErrors.publicSlug"
          >
            <input
              id="public-slug"
              v-model="publicSlug"
              class="form-control"
              type="text"
              autocomplete="off"
              :aria-invalid="fieldErrors.publicSlug ? true : undefined"
              :aria-describedby="describedBy('public-slug', 'publicSlug', true)"
            />
          </UiFormField>
        </div>

        <h3 class="wards__subhead">First administrator</h3>
        <div class="wards__form-grid">
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
          <UiFormField label="Initial admin display name" input-id="admin-display-name" :error="fieldErrors.adminDisplayName">
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
        </div>
        <UiFormField
          label="Initial admin email"
          input-id="admin-email"
          hint="Stored lowercase and unique within the new ward."
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
        <div class="wards__form-grid">
          <UiFormField label="Initial admin password" input-id="admin-password" hint="Minimum 12 characters." :error="fieldErrors.adminPassword">
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
            hint="Shared sign-in code. Stored only as a hash."
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
        </div>

        <div class="wards__actions">
          <UiAppButton type="submit" :disabled="submitting">
            {{ submitting ? 'Creating…' : 'Create ward' }}
          </UiAppButton>
          <UiAppButton variant="secondary" type="button" :disabled="submitting" @click="cancelCreateForm">
            Cancel
          </UiAppButton>
        </div>
      </form>
    </section>

    <UiLoadingState v-if="pageState.kind === 'loading'" message="Loading wards…" />

    <section v-else-if="pageState.kind === 'loaded'" aria-labelledby="wards-heading">
      <h2 id="wards-heading" class="wards__list-title">Active wards</h2>
      <UiEmptyState
        v-if="pageState.wards.length === 0"
        title="No wards yet"
        description="Create the first ward to start a separate tenant."
      >
        <template #actions>
          <UiAppButton type="button" @click="openCreateForm">New ward</UiAppButton>
        </template>
      </UiEmptyState>
      <ul v-else class="ward-list">
        <li v-for="ward in pageState.wards" :key="ward.id" class="ward-card">
          <div class="ward-card__summary">
            <div>
              <h3 class="ward-card__name">{{ ward.name }}</h3>
              <p class="ward-card__meta">
                {{ ward.timeZone }} · Created {{ formatCreatedAt(ward.createdAt) }}
              </p>
              <p class="ward-card__meta">{{ adminNames(ward) }}</p>
              <p class="ward-card__meta">
                Public page
                <NuxtLink :to="`/${ward.publicSlug}`">/{{ ward.publicSlug }}</NuxtLink>
              </p>
            </div>
            <UiAppButton
              variant="secondary"
              type="button"
              :aria-expanded="expandedWardId === ward.id"
              :aria-controls="`ward-manage-${ward.id}`"
              @click="toggleManage(ward.id)"
            >
              {{ expandedWardId === ward.id ? 'Close' : 'Manage' }}
            </UiAppButton>
          </div>

          <div v-if="expandedWardId === ward.id" :id="`ward-manage-${ward.id}`" class="ward-card__manage">
            <form class="ward-card__row-form" novalidate @submit.prevent="savePublicSlug(ward.id)">
              <UiFormField
                :label="`Public page path for ${ward.name}`"
                :input-id="`public-slug-${ward.id}`"
                hint="Letters and numbers only. This is not the login ward code."
              >
                <input
                  :id="`public-slug-${ward.id}`"
                  v-model="slugDrafts[ward.id]"
                  class="form-control"
                  type="text"
                  autocomplete="off"
                  required
                />
              </UiFormField>
              <UiAppButton type="submit" variant="secondary" :disabled="savingSlugId === ward.id">
                {{ savingSlugId === ward.id ? 'Saving…' : 'Save path' }}
              </UiAppButton>
            </form>

            <div v-if="ward.admins.length === 0" class="wards__hint">No WardAdmin accounts on this ward.</div>
            <ul v-else class="admin-list">
              <li v-for="admin in ward.admins" :key="admin.id" class="admin-list__item">
                <div>
                  <p class="admin-list__name">{{ admin.displayName }} <span class="wards__hint">@{{ admin.username }}</span></p>
                  <p v-if="admin.email" class="wards__hint">{{ admin.email }}</p>
                </div>
                <div class="admin-list__actions">
                  <UiAppButton
                    variant="ghost"
                    type="button"
                    :disabled="emailingAdminId === admin.id || !admin.email"
                    @click="emailAdminPasswordReset(ward.id, admin.id, admin.email)"
                  >
                    {{ emailingAdminId === admin.id ? 'Emailing…' : 'Email reset link' }}
                  </UiAppButton>
                </div>
                <form class="ward-card__stack-form" novalidate @submit.prevent="resetAdminPassword(ward.id, admin.id)">
                  <UiFormField
                    :label="`Set password for ${admin.username}`"
                    :input-id="`reset-password-${admin.id}`"
                    hint="Emergency override. Prefer email reset. Minimum 12 characters."
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
                  <UiAppButton variant="secondary" type="submit" :disabled="resettingAdminId === admin.id">
                    {{ resettingAdminId === admin.id ? 'Saving…' : 'Set password' }}
                  </UiAppButton>
                </form>
              </li>
            </ul>

            <form class="ward-card__stack-form" novalidate @submit.prevent="rotateWardCode(ward.id)">
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
              <UiAppButton variant="danger" type="submit" :disabled="rotatingWardId === ward.id">
                {{ rotatingWardId === ward.id ? 'Rotating…' : 'Rotate ward code' }}
              </UiAppButton>
            </form>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.wards {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.wards__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.wards__header h2 {
  font-size: 1.375rem;
  font-weight: 700;
}

.wards__lede,
.wards__hint {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  max-width: 40rem;
}

.wards__lede {
  margin-top: var(--space-2);
}

.wards__list-title {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: var(--space-4);
}

.wards__subhead {
  font-size: 0.9375rem;
  font-weight: 700;
  margin: var(--space-2) 0 0;
}

.wards__panel,
.wards__notice,
.ward-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.wards__panel,
.wards__notice {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.wards__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.wards__form,
.ward-card__stack-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.wards__form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: var(--space-4);
}

.wards__actions,
.ward-card__row-form,
.admin-list__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

.ward-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ward-card__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5);
}

.ward-card__name {
  font-size: 1.0625rem;
  font-weight: 700;
}

.ward-card__meta {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.ward-card__manage {
  border-top: 1px solid var(--color-border);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  background: var(--color-surface-muted);
}

.ward-card__row-form {
  align-items: stretch;
}

.ward-card__row-form :deep(.field) {
  flex: 1;
  min-width: 12rem;
}

.admin-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-list__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-list__name {
  font-weight: 600;
}

@media (max-width: 640px) {
  .ward-card__summary {
    flex-direction: column;
  }
}
</style>
