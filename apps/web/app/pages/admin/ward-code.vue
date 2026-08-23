<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { WardCodeInfoDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const codeInfo = ref<WardCodeInfoDto | null | undefined>(undefined);
const actionError = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const newWardCode = ref('');

function canManage(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('ward.manage');
}

async function load(): Promise<void> {
  codeInfo.value = undefined;
  try {
    codeInfo.value = await client.getWardCodeInfo();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to load ward code info.';
    codeInfo.value = null;
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  if (!canManage()) {
    await navigateTo('/');
    return;
  }
  await load();
});

async function rotate(): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  try {
    codeInfo.value = await client.rotateWardCode(newWardCode.value);
    newWardCode.value = '';
    successMessage.value = 'Ward code rotated. All users must re-enter the new code on their next sign-in.';
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to rotate ward code.';
  }
}
</script>

<template>
  <main class="admin-page">
    <h1>Ward code</h1>
    <p class="admin-page__hint">
      Rotating the ward code requires every user to verify the new code on their next sign-in.
      The raw code is never stored or displayed after rotation.
    </p>

    <p v-if="codeInfo === undefined">Loading…</p>
    <p v-if="actionError" role="alert" class="admin-page__error">{{ actionError }}</p>
    <p v-if="successMessage" class="admin-page__success">{{ successMessage }}</p>

    <section v-if="codeInfo !== undefined && codeInfo !== null" aria-labelledby="active-code-heading">
      <h2 id="active-code-heading">Active version</h2>
      <p>Version {{ codeInfo.version }}</p>
      <p v-if="codeInfo.activatedAt" class="admin-page__hint">Activated {{ codeInfo.activatedAt }}</p>
    </section>
    <p v-else-if="codeInfo === null">No active ward code is configured.</p>

    <section aria-labelledby="rotate-heading">
      <h2 id="rotate-heading">Rotate ward code</h2>
      <form class="admin-page__form" novalidate @submit.prevent="rotate">
        <label for="new-ward-code">New ward code</label>
        <input id="new-ward-code" v-model="newWardCode" required autocomplete="off" />
        <button type="submit">Rotate ward code</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.admin-page {
  max-width: 36rem;
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
  max-width: 24rem;
}

.admin-page__form input {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.admin-page__hint {
  color: #57606a;
  font-size: 0.875rem;
}

.admin-page__error {
  color: #cf222e;
  font-weight: 600;
}

.admin-page__success {
  color: #1a7f37;
  font-weight: 600;
}
</style>
