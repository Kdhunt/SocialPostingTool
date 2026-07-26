<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { CommunicationChannel, ProviderCredentialSummaryDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

const CHANNELS: CommunicationChannel[] = ['Email', 'Sms', 'FacebookPage'];

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const credentials = ref<ProviderCredentialSummaryDto[]>([]);
const loading = ref(true);
const actionError = ref<string | null>(null);

const channel = ref<CommunicationChannel>('Email');
const providerAccountReference = ref('');
const credentialsJson = ref('');
const expiresAt = ref('');

function canManage(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('campaigns.send');
}

async function load(): Promise<void> {
  loading.value = true;
  actionError.value = null;
  try {
    const response = await client.listProviderCredentials();
    credentials.value = response.credentials;
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to load credentials.';
  } finally {
    loading.value = false;
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

async function upsert(): Promise<void> {
  actionError.value = null;
  try {
    JSON.parse(credentialsJson.value);
  } catch {
    actionError.value = 'Credentials must be valid JSON.';
    return;
  }
  try {
    await client.upsertProviderCredential({
      channel: channel.value,
      providerAccountReference: providerAccountReference.value,
      credentialsJson: credentialsJson.value,
      expiresAt: expiresAt.value ? new Date(expiresAt.value).toISOString() : null,
    });
    providerAccountReference.value = '';
    credentialsJson.value = '';
    expiresAt.value = '';
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to save credentials.';
  }
}

async function revoke(id: string): Promise<void> {
  actionError.value = null;
  try {
    await client.revokeProviderCredential(id);
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to revoke credentials.';
  }
}
</script>

<template>
  <main class="admin-page">
    <h1>Provider credentials</h1>
    <p class="admin-page__hint">
      Secrets are encrypted at rest and never returned by the API. Match
      <code>providerAccountReference</code> to your communication destination.
    </p>

    <p v-if="loading">Loading…</p>
    <p v-if="actionError" role="alert" class="admin-page__error">{{ actionError }}</p>

    <section aria-labelledby="upsert-heading">
      <h2 id="upsert-heading">Upsert credentials</h2>
      <form class="admin-page__form" novalidate @submit.prevent="upsert">
        <label for="cred-channel">Channel</label>
        <select id="cred-channel" v-model="channel">
          <option v-for="item in CHANNELS" :key="item" :value="item">{{ item }}</option>
        </select>

        <label for="cred-ref">Provider account reference</label>
        <input id="cred-ref" v-model="providerAccountReference" required />

        <label for="cred-json">Credentials JSON</label>
        <textarea id="cred-json" v-model="credentialsJson" rows="6" required spellcheck="false" />

        <label for="cred-expires">Expires at (optional)</label>
        <input id="cred-expires" v-model="expiresAt" type="datetime-local" />

        <button type="submit">Save credentials</button>
      </form>
      <details class="admin-page__examples">
        <summary>Example JSON shapes</summary>
        <pre>Email (SendGrid): {"provider":"sendgrid","apiKey":"...","fromAddress":"noreply@example.test"}
Email (SMTP): {"provider":"smtp","host":"localhost","port":1025,"user":"...","pass":"...","fromAddress":"..."}
SMS: {"accountSid":"...","authToken":"...","fromNumber":"+15555550100"}
Facebook Page: {"pageAccessToken":"...","pageId":"..."}</pre>
      </details>
    </section>

    <section aria-labelledby="list-heading">
      <h2 id="list-heading">Stored credentials</h2>
      <ul v-if="credentials.length > 0" class="admin-page__list">
        <li v-for="cred in credentials" :key="cred.id">
          <div>
            <strong>{{ cred.channel }}</strong> — {{ cred.providerAccountReference }}
            <span v-if="cred.revokedAt" class="admin-page__tag">Revoked</span>
            <span v-else-if="cred.expiresAt" class="admin-page__hint">Expires {{ cred.expiresAt }}</span>
          </div>
          <button v-if="!cred.revokedAt" type="button" class="admin-page__danger" @click="revoke(cred.id)">
            Revoke
          </button>
        </li>
      </ul>
      <p v-else-if="!loading">No credentials configured.</p>
    </section>
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
  max-width: 32rem;
}

.admin-page__form input,
.admin-page__form select,
.admin-page__form textarea {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-family: inherit;
}

.admin-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.admin-page__list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.admin-page__hint {
  color: #57606a;
  font-size: 0.875rem;
}

.admin-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #fff8c5;
  border: 1px solid #9a6700;
}

.admin-page__error {
  color: #cf222e;
  font-weight: 600;
}

.admin-page__danger {
  color: #cf222e;
  border-color: #cf222e;
}

.admin-page__examples pre {
  white-space: pre-wrap;
  font-size: 0.8125rem;
  background: #f6f8fa;
  padding: 0.75rem;
  border-radius: 0.375rem;
}
</style>
