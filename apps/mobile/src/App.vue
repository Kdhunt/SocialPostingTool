<script setup lang="ts">
import { IonApp, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { onMounted, ref } from 'vue';
import { WardCommsApiClient } from '@ward-comms/api-client';
import { StatusBadge } from '@ward-comms/ui';
import { toStatusBadgeLabel, toStatusBadgeTone, type HealthPageState } from './health-status';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
const state = ref<HealthPageState>({ kind: 'loading' });

async function checkHealth(): Promise<void> {
  state.value = { kind: 'loading' };

  try {
    const client = new WardCommsApiClient({ baseUrl: apiBaseUrl });
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
});
</script>

<template>
  <IonApp>
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Ward Communications Hub</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent class="ion-padding">
        <p>This screen verifies the mobile shell can reach the API.</p>
        <StatusBadge :tone="toStatusBadgeTone(state)" :label="toStatusBadgeLabel(state)" />
      </IonContent>
    </IonPage>
  </IonApp>
</template>
