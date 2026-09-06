<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import {
  createUserRequestSchema,
  fieldErrorsFromUnknown,
  fieldErrorsFromZodError,
  resetPasswordRequestSchema,
  type CreateUserRequest,
  type RoleSummaryDto,
  type UserSummaryDto,
} from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; users: UserSummaryDto[]; roles: RoleSummaryDto[] };

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

type CreateUserField = keyof CreateUserRequest;

const pageState = ref<PageState>({ kind: 'loading' });
const actionError = ref<string | null>(null);
const fieldErrors = ref<Partial<Record<CreateUserField, string>>>({});

const newUsername = ref('');
const newEmail = ref('');
const newPassword = ref('');
const newDisplayName = ref('');
const newRoleIds = ref<string[]>([]);

const editingUserId = ref<string | null>(null);
const editRoleIds = ref<string[]>([]);
const resettingUserId = ref<string | null>(null);
const resetPasswordValue = ref('');
const resetPasswordError = ref<string | null>(null);
const resetting = ref(false);

function canManageUsers(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('users.manage');
}

function canManageRoles(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('roles.manage');
}

function describedBy(inputId: string, field: CreateUserField, hasHint: boolean): string | undefined {
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
    const [{ users }, { roles }] = await Promise.all([client.listUsers(), client.listRoles()]);
    pageState.value = { kind: 'loaded', users, roles };
  } catch (error) {
    pageState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load users.',
    };
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  if (!canManageUsers()) {
    await navigateTo('/');
    return;
  }
  await load();
});

async function createUser(): Promise<void> {
  actionError.value = null;
  fieldErrors.value = {};

  const payload: CreateUserRequest = {
    username: newUsername.value.trim(),
    email: newEmail.value,
    password: newPassword.value,
    displayName: newDisplayName.value.trim(),
    roleIds: newRoleIds.value,
  };

  const parsed = createUserRequestSchema.safeParse(payload);
  if (!parsed.success) {
    applyFieldErrors(fieldErrorsFromZodError(parsed.error));
    return;
  }

  try {
    await client.createUser(parsed.data);
    newUsername.value = '';
    newEmail.value = '';
    newPassword.value = '';
    newDisplayName.value = '';
    newRoleIds.value = [];
    await load();
  } catch (error) {
    const zodFields = fieldErrorsFromUnknown(error);
    if (zodFields && Object.keys(zodFields).length > 0) {
      applyFieldErrors(zodFields);
    } else {
      actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to create user.';
    }
  }
}

function startResetPassword(user: UserSummaryDto): void {
  editingUserId.value = null;
  resettingUserId.value = user.id;
  resetPasswordValue.value = '';
  resetPasswordError.value = null;
  actionError.value = null;
}

async function submitResetPassword(userId: string): Promise<void> {
  actionError.value = null;
  resetPasswordError.value = null;

  const parsed = resetPasswordRequestSchema.safeParse({ password: resetPasswordValue.value });
  if (!parsed.success) {
    resetPasswordError.value =
      fieldErrorsFromZodError(parsed.error).password ?? 'Password must be at least 12 characters.';
    return;
  }

  resetting.value = true;
  try {
    await client.resetUserPassword(userId, parsed.data.password);
    resettingUserId.value = null;
    resetPasswordValue.value = '';
    await load();
  } catch (error) {
    const zodFields = fieldErrorsFromUnknown(error);
    if (zodFields?.password) {
      resetPasswordError.value = zodFields.password;
    } else {
      actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to reset password.';
    }
  } finally {
    resetting.value = false;
  }
}

function startEditRoles(user: UserSummaryDto): void {
  resettingUserId.value = null;
  editingUserId.value = user.id;
  editRoleIds.value = [...user.roleIds];
}

async function saveRoles(userId: string): Promise<void> {
  actionError.value = null;
  try {
    await client.assignUserRoles(userId, editRoleIds.value);
    editingUserId.value = null;
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to update roles.';
  }
}

async function toggleDisabled(user: UserSummaryDto): Promise<void> {
  actionError.value = null;
  try {
    if (user.disabledAt) {
      await client.enableUser(user.id);
    } else {
      await client.disableUser(user.id);
    }
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to update account status.';
  }
}

function toggleNewRole(roleId: string, checked: boolean): void {
  if (checked) {
    newRoleIds.value = [...newRoleIds.value, roleId];
  } else {
    newRoleIds.value = newRoleIds.value.filter((id) => id !== roleId);
  }
}

function toggleEditRole(roleId: string, checked: boolean): void {
  if (checked) {
    editRoleIds.value = [...editRoleIds.value, roleId];
  } else {
    editRoleIds.value = editRoleIds.value.filter((id) => id !== roleId);
  }
}
</script>

<template>
  <main class="admin-page">
    <h1>User management</h1>

    <p v-if="pageState.kind === 'loading'">Loading…</p>
    <p v-else-if="pageState.kind === 'error'" role="alert" class="admin-page__error">{{ pageState.message }}</p>
    <p v-if="actionError" role="alert" class="admin-page__error">{{ actionError }}</p>

    <template v-else-if="pageState.kind === 'loaded'">
      <section aria-labelledby="create-user-heading">
        <h2 id="create-user-heading">Create user</h2>
        <form class="admin-page__form" novalidate @submit.prevent="createUser">
          <UiFormField label="Username" input-id="new-username" :error="fieldErrors.username">
            <input
              id="new-username"
              v-model="newUsername"
              required
              autocomplete="off"
              :aria-invalid="fieldErrors.username ? true : undefined"
              :aria-describedby="describedBy('new-username', 'username', false)"
            />
          </UiFormField>

          <UiFormField
            label="Email"
            input-id="new-email"
            hint="Required. Stored lowercase and unique within this ward."
            :error="fieldErrors.email"
          >
            <input
              id="new-email"
              v-model="newEmail"
              type="email"
              required
              autocomplete="off"
              :aria-invalid="fieldErrors.email ? true : undefined"
              :aria-describedby="describedBy('new-email', 'email', true)"
            />
          </UiFormField>

          <UiFormField label="Display name" input-id="new-display-name" :error="fieldErrors.displayName">
            <input
              id="new-display-name"
              v-model="newDisplayName"
              required
              :aria-invalid="fieldErrors.displayName ? true : undefined"
              :aria-describedby="describedBy('new-display-name', 'displayName', false)"
            />
          </UiFormField>

          <UiFormField
            label="Password"
            input-id="new-password"
            hint="Minimum 12 characters."
            :error="fieldErrors.password"
          >
            <input
              id="new-password"
              v-model="newPassword"
              type="password"
              required
              autocomplete="new-password"
              :aria-invalid="fieldErrors.password ? true : undefined"
              :aria-describedby="describedBy('new-password', 'password', true)"
            />
          </UiFormField>

          <fieldset>
            <legend>Roles</legend>
            <label v-for="role in pageState.roles" :key="role.id" class="admin-page__checkbox">
              <input
                type="checkbox"
                :checked="newRoleIds.includes(role.id)"
                @change="toggleNewRole(role.id, ($event.target as HTMLInputElement).checked)"
              />
              {{ role.name }}
            </label>
            <p v-if="fieldErrors.roleIds" id="new-roles-error" class="admin-page__error" role="alert">
              {{ fieldErrors.roleIds }}
            </p>
          </fieldset>

          <button type="submit">Create user</button>
        </form>
      </section>

      <section aria-labelledby="users-heading">
        <h2 id="users-heading">Users</h2>
        <ul class="admin-page__list">
          <li v-for="user in pageState.users" :key="user.id">
            <div class="admin-page__user-info">
              <strong>{{ user.displayName }}</strong>
              <span class="admin-page__hint">@{{ user.username }}</span>
              <span v-if="user.email" class="admin-page__hint">{{ user.email }}</span>
              <span v-if="user.disabledAt" class="admin-page__tag">Disabled</span>
              <span class="admin-page__hint">{{ user.roleNames.join(', ') }}</span>
            </div>
            <div class="admin-page__actions">
              <button type="button" @click="toggleDisabled(user)">
                {{ user.disabledAt ? 'Enable' : 'Disable' }}
              </button>
              <button type="button" @click="startResetPassword(user)">Reset password</button>
              <button v-if="canManageRoles()" type="button" @click="startEditRoles(user)">Edit roles</button>
            </div>
            <form
              v-if="resettingUserId === user.id"
              class="admin-page__form admin-page__form--inline"
              novalidate
              @submit.prevent="submitResetPassword(user.id)"
            >
              <UiFormField
                :label="`New password for ${user.username}`"
                :input-id="`reset-password-${user.id}`"
                hint="Minimum 12 characters. This user’s sessions are revoked."
                :error="resetPasswordError ?? undefined"
              >
                <input
                  :id="`reset-password-${user.id}`"
                  v-model="resetPasswordValue"
                  type="password"
                  required
                  autocomplete="new-password"
                  :aria-invalid="resetPasswordError ? true : undefined"
                />
              </UiFormField>
              <button type="submit" :disabled="resetting">
                {{ resetting ? 'Resetting…' : 'Save new password' }}
              </button>
              <button type="button" @click="resettingUserId = null">Cancel</button>
            </form>
            <form
              v-if="editingUserId === user.id && canManageRoles()"
              class="admin-page__form admin-page__form--inline"
              @submit.prevent="saveRoles(user.id)"
            >
              <fieldset>
                <legend>Assign roles for {{ user.username }}</legend>
                <label v-for="role in pageState.roles" :key="role.id" class="admin-page__checkbox">
                  <input
                    type="checkbox"
                    :checked="editRoleIds.includes(role.id)"
                    @change="toggleEditRole(role.id, ($event.target as HTMLInputElement).checked)"
                  />
                  {{ role.name }}
                </label>
              </fieldset>
              <button type="submit">Save roles</button>
              <button type="button" @click="editingUserId = null">Cancel</button>
            </form>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.admin-page {
  max-width: 48rem;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.admin-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 28rem;
}

.admin-page__form input {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.admin-page__form--inline {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #d0d7de;
}

.admin-page__checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.admin-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.admin-page__list li {
  padding: 0.75rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.admin-page__user-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.admin-page__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.admin-page__hint {
  color: #57606a;
  font-size: 0.875rem;
}

.admin-page__tag {
  display: inline-block;
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #fff8c5;
  border: 1px solid #9a6700;
  width: fit-content;
}

.admin-page__error {
  color: #cf222e;
  font-weight: 600;
}
</style>
