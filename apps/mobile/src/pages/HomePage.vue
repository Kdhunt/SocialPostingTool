<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { StatusBadge } from '@ward-comms/ui';
import { isPlatformOperatorView } from '@ward-comms/domain';
import { WardCommsApiClient } from '@ward-comms/api-client';
import { toStatusBadgeLabel, toStatusBadgeTone, type HealthPageState } from '../health-status.js';
import { mobileAuthStore } from '../auth-store.js';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
const state = ref<HealthPageState>({ kind: 'loading' });
const router = useRouter();

async function checkHealth(): Promise<void> {
  state.value = { kind: 'loading' };
  try {
    const client = new WardCommsApiClient({ baseUrl: apiBaseUrl });
    const health = await client.getHealth();
    state.value = { kind: 'success', service: health.service, timestamp: health.timestamp };
  } catch (error) {
    state.value = { kind: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function signOut(): Promise<void> {
  await mobileAuthStore.logout();
  await router.replace('/login');
}

const isPlatformOperator = computed(
  () =>
    mobileAuthStore.state.value.kind === 'authenticated' &&
    isPlatformOperatorView(mobileAuthStore.state.value.user.permissions),
);

onMounted(() => {
  void checkHealth();
  if (mobileAuthStore.state.value.kind !== 'authenticated') {
    void router.replace('/login');
  }
});
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Ward Communications Hub</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p v-if="mobileAuthStore.state.value.kind === 'authenticated'">
        Signed in as <strong>{{ mobileAuthStore.state.value.user.displayName }}</strong>.
      </p>
      <StatusBadge :tone="toStatusBadgeTone(state)" :label="toStatusBadgeLabel(state)" />
      <p v-if="isPlatformOperator">
        Platform operators manage wards on the web app. Member directory and campaigns stay in each ward login.
      </p>
      <template v-else>
        <p><router-link to="/directory">Search directory</router-link></p>
        <p><router-link to="/audiences">View audiences</router-link></p>
        <p><router-link to="/campaigns">View campaigns</router-link></p>
      </template>
      <button type="button" @click="signOut">Sign out</button>
    </IonContent>
  </IonPage>
</template>
