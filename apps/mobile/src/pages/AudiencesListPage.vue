<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonHeader, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { ApiRequestError } from '@ward-comms/api-client';
import type { AudienceGroupSummaryDto } from '@ward-comms/validation';
import { mobileAuthStore } from '../auth-store.js';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; audiences: AudienceGroupSummaryDto[] };

const router = useRouter();
const listState = ref<ListState>({ kind: 'loading' });

async function load(): Promise<void> {
  listState.value = { kind: 'loading' };
  try {
    const { audiences } = await mobileAuthStore.client.searchAudiences({});
    listState.value = { kind: 'loaded', audiences };
  } catch (error) {
    listState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load audiences.',
    };
  }
}

function openAudience(id: string): void {
  void router.push(`/audiences/${id}`);
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
        <IonTitle>Audiences</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p><router-link to="/home">Back to home</router-link></p>
      <p v-if="listState.kind === 'loading'">Loading…</p>
      <p v-else-if="listState.kind === 'error'" role="alert">{{ listState.message }}</p>
      <p v-else-if="listState.kind === 'loaded' && listState.audiences.length === 0">No audiences yet.</p>
      <IonList v-else-if="listState.kind === 'loaded'">
        <IonItem v-for="audience in listState.audiences" :key="audience.id" button @click="openAudience(audience.id)">
          <IonLabel>
            {{ audience.name }}
            <p>{{ audience.memberCount }} member(s)</p>
          </IonLabel>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>
