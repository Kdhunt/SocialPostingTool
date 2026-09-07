<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo, useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { FacebookPageChoiceDto, FacebookPageConnectionDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

const client = useApiClient();
const route = useRoute();
const { state: authState, refreshSession } = useAuth();

const loading = ref(true);
const actionError = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const oauthEnabled = ref(false);
const connections = ref<FacebookPageConnectionDto[]>([]);
const choices = ref<FacebookPageChoiceDto[]>([]);

const pageId = ref('');
const pageAccessToken = ref('');
const pageName = ref('');

function canManage(): boolean {
  return authState.value.kind === 'authenticated' && authState.value.user.permissions.includes('campaigns.send');
}

async function load(): Promise<void> {
  loading.value = true;
  actionError.value = null;
  try {
    const response = await client.listFacebookPageConnections();
    oauthEnabled.value = response.oauthEnabled;
    connections.value = response.connections;
    if (route.query.choose === '1') {
      const pending = await client.listFacebookPageOauthChoices();
      choices.value = pending.pages;
    }
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to load Facebook Page connections.';
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
  const queryError = route.query.error;
  if (typeof queryError === 'string' && queryError.length > 0) {
    actionError.value = queryError;
  }
  if (route.query.connected === '1') {
    successMessage.value = 'Facebook Page connected for this ward.';
  }
  await load();
});

async function connectWithToken(): Promise<void> {
  actionError.value = null;
  successMessage.value = null;
  try {
    await client.connectFacebookPage({
      pageId: pageId.value,
      pageAccessToken: pageAccessToken.value,
      pageName: pageName.value || undefined,
    });
    pageId.value = '';
    pageAccessToken.value = '';
    pageName.value = '';
    successMessage.value = 'Facebook Page connected for this ward.';
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to connect this Facebook Page.';
  }
}

async function startOauth(): Promise<void> {
  actionError.value = null;
  try {
    const { authorizationUrl } = await client.startFacebookPageOauth();
    window.location.assign(authorizationUrl);
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to start Facebook connection.';
  }
}

async function choosePage(id: string): Promise<void> {
  actionError.value = null;
  try {
    await client.chooseFacebookPage(id);
    choices.value = [];
    successMessage.value = 'Facebook Page connected for this ward.';
    await navigateTo('/admin/facebook-page');
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to choose that Facebook Page.';
  }
}

async function disconnect(id: string): Promise<void> {
  actionError.value = null;
  try {
    await client.disconnectFacebookPage(id);
    successMessage.value = 'Facebook Page disconnected for this ward.';
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to disconnect this Facebook Page.';
  }
}
</script>

<template>
  <main class="admin-page">
    <h1>Facebook Page</h1>
    <p class="admin-page__hint">
      Each ward connects its own Facebook Page. Campaigns from this ward publish only to the pages listed here.
      Page access tokens are encrypted and never shown again.
    </p>

    <p v-if="loading">Loading…</p>
    <p v-if="actionError" role="alert" class="admin-page__error">{{ actionError }}</p>
    <p v-if="successMessage" class="admin-page__success">{{ successMessage }}</p>

    <section v-if="choices.length > 0" aria-labelledby="choose-heading">
      <h2 id="choose-heading">Choose a page</h2>
      <p class="admin-page__hint">This Facebook account manages more than one Page. Pick the page for this ward.</p>
      <ul class="admin-page__list">
        <li v-for="choice in choices" :key="choice.pageId">
          <span>{{ choice.pageName }}</span>
          <button type="button" @click="choosePage(choice.pageId)">Connect this page</button>
        </li>
      </ul>
    </section>

    <section aria-labelledby="connected-heading">
      <h2 id="connected-heading">Connected pages for this ward</h2>
      <ul v-if="connections.length > 0" class="admin-page__list">
        <li v-for="connection in connections" :key="connection.pageId">
          <div>
            <strong>{{ connection.pageName }}</strong>
            <p class="admin-page__hint">Page id {{ connection.pageId }}</p>
          </div>
          <button type="button" class="admin-page__danger" @click="disconnect(connection.pageId)">Disconnect</button>
        </li>
      </ul>
      <p v-else-if="!loading">No Facebook Page is connected for this ward yet.</p>
    </section>

    <section v-if="oauthEnabled" aria-labelledby="oauth-heading">
      <h2 id="oauth-heading">Connect with Facebook</h2>
      <p class="admin-page__hint">Sign in with a Facebook account that can manage this ward’s Page.</p>
      <button type="button" @click="startOauth">Connect Facebook Page</button>
    </section>

    <section aria-labelledby="token-heading">
      <h2 id="token-heading">Connect with a Page access token</h2>
      <p class="admin-page__hint">
        Paste a Page access token and Page id from Meta. Use a token that belongs to this ward’s Page only.
      </p>
      <form class="admin-page__form" novalidate @submit.prevent="connectWithToken">
        <label for="fb-page-name">Page name (optional)</label>
        <input id="fb-page-name" v-model="pageName" autocomplete="off" />

        <label for="fb-page-id">Page id</label>
        <input id="fb-page-id" v-model="pageId" required autocomplete="off" />

        <label for="fb-page-token">Page access token</label>
        <input id="fb-page-token" v-model="pageAccessToken" type="password" required autocomplete="off" />

        <button type="submit">Save page for this ward</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.admin-page {
  max-width: 40rem;
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

.admin-page__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.admin-page__list li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
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

.admin-page__danger {
  color: #cf222e;
}
</style>
