<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { RoleSummaryDto, UserSummaryDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; users: UserSummaryDto[]; roles: RoleSummaryDto[] };

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const pageState = ref<PageState>({ kind: 'loading' });
const actionError = ref<string | null>(null);

const newUsername = ref('');
const newPassword = ref('');
const newDisplayName = ref('');
const newRoleIds = ref<string[]>([]);

const editingUserId = ref<string | null>(null);
const editRoleIds = ref<string[]>([]);

function canManageUsers(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('users.manage');
}

function canManageRoles(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('roles.manage');
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
  try {
    await client.createUser({
      username: newUsername.value,
      password: newPassword.value,
      displayName: newDisplayName.value,
      roleIds: newRoleIds.value,
    });
    newUsername.value = '';
    newPassword.value = '';
    newDisplayName.value = '';
    newRoleIds.value = [];
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to create user.';
  }
}

function startEditRoles(user: UserSummaryDto): void {
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
          <label for="new-username">Username</label>
          <input id="new-username" v-model="newUsername" required autocomplete="off" />

          <label for="new-display-name">Display name</label>
          <input id="new-display-name" v-model="newDisplayName" required />

          <label for="new-password">Password (min 12 characters)</label>
          <input id="new-password" v-model="newPassword" type="password" required autocomplete="new-password" />

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
          </fieldset>

          <button type="submit" :disabled="newRoleIds.length === 0">Create user</button>
        </form>
      </section>

      <section aria-labelledby="users-heading">
        <h2 id="users-heading">Users</h2>
        <ul class="admin-page__list">
          <li v-for="user in pageState.users" :key="user.id">
            <div class="admin-page__user-info">
              <strong>{{ user.displayName }}</strong>
              <span class="admin-page__hint">@{{ user.username }}</span>
              <span v-if="user.disabledAt" class="admin-page__tag">Disabled</span>
              <span class="admin-page__hint">{{ user.roleNames.join(', ') }}</span>
            </div>
            <div class="admin-page__actions">
              <button type="button" @click="toggleDisabled(user)">
                {{ user.disabledAt ? 'Enable' : 'Disable' }}
              </button>
              <button v-if="canManageRoles()" type="button" @click="startEditRoles(user)">Edit roles</button>
            </div>
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
