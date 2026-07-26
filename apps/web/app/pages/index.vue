<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRuntimeConfig } from '#imports';
import { WardCommsApiClient } from '@ward-comms/api-client';
import { StatusBadge } from '@ward-comms/ui';
import { toStatusBadgeLabel, toStatusBadgeTone, type HealthPageState } from '~/utils/health-status';
import { useAuth } from '~/composables/useAuth';

const config = useRuntimeConfig();
const state = ref<HealthPageState>({ kind: 'loading' });
const { state: authState, refreshSession, logout } = useAuth();

async function checkHealth(): Promise<void> {
  state.value = { kind: 'loading' };

  try {
    const client = new WardCommsApiClient({ baseUrl: config.public.apiBaseUrl });
    const health = await client.getHealth();
    state.value = { kind: 'success', service: health.service, timestamp: health.timestamp };
  } catch (error) {
    state.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

onMounted(() => {
  void checkHealth();
  void refreshSession();
});
</script>

<template>
  <main class="health-page">
    <h1>Ward Communications Hub</h1>
    <p>This page verifies the web application can reach the API.</p>

    <StatusBadge :tone="toStatusBadgeTone(state)" :label="toStatusBadgeLabel(state)" />

    <p v-if="state.kind === 'success'" class="health-page__timestamp">
      Last checked: {{ state.timestamp }}
    </p>

    <button type="button" :disabled="state.kind === 'loading'" @click="checkHealth">Recheck</button>

    <section class="health-page__auth">
      <template v-if="authState.kind === 'authenticated'">
        <p>Signed in as <strong>{{ authState.user.displayName }}</strong>.</p>
        <button type="button" @click="logout">Sign out</button>
      </template>
      <template v-else-if="authState.kind === 'anonymous'">
        <NuxtLink to="/login">Sign in</NuxtLink>
      </template>
    </section>
  </main>
</template>

<style scoped>
.health-page {
  max-width: 32rem;
  margin: 3rem auto;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.health-page__timestamp {
  color: #57606a;
  font-size: 0.875rem;
}

.health-page__auth {
  padding-top: 1rem;
  border-top: 1px solid #d0d7de;
}
</style>
