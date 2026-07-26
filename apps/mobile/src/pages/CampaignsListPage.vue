<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonHeader, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { ApiRequestError } from '@ward-comms/api-client';
import type { CampaignSummaryDto } from '@ward-comms/validation';
import { mobileAuthStore } from '../auth-store.js';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; campaigns: CampaignSummaryDto[] };

const router = useRouter();
const listState = ref<ListState>({ kind: 'loading' });

async function load(): Promise<void> {
  listState.value = { kind: 'loading' };
  try {
    const { campaigns } = await mobileAuthStore.client.searchCampaigns({});
    listState.value = { kind: 'loaded', campaigns };
  } catch (error) {
    listState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load campaigns.',
    };
  }
}

function openCampaign(id: string): void {
  void router.push(`/campaigns/${id}`);
}

onMounted(() => {
  if (mobileAuthStore.state.value.kind !== 'authenticated') {
    void router.replace('/login');
    return;
  }
  void load();
});
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Campaigns</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p><router-link to="/home">Back to home</router-link></p>
      <p v-if="listState.kind === 'loading'">Loading…</p>
      <p v-else-if="listState.kind === 'error'" role="alert">{{ listState.message }}</p>
      <p v-else-if="listState.kind === 'loaded' && listState.campaigns.length === 0">No campaigns yet.</p>
      <IonList v-else-if="listState.kind === 'loaded'">
        <IonItem v-for="campaign in listState.campaigns" :key="campaign.id" button @click="openCampaign(campaign.id)">
          <IonLabel>
            {{ campaign.name }}
            <p>{{ campaign.status }} · v{{ campaign.currentVersionNumber }}</p>
          </IonLabel>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>
