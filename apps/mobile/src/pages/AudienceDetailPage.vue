<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonContent, IonHeader, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { ApiRequestError } from '@ward-comms/api-client';
import type { AudienceGroupDetailDto } from '@ward-comms/validation';
import { mobileAuthStore } from '../auth-store.js';

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; audience: AudienceGroupDetailDto };

const route = useRoute();
const router = useRouter();
const audienceId = route.params.id as string;
const pageState = ref<PageState>({ kind: 'loading' });

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const audience = await mobileAuthStore.client.getAudience(audienceId);
    pageState.value = { kind: 'loaded', audience };
  } catch (error) {
    pageState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load audience.',
    };
  }
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
        <IonTitle>Audience detail</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p><router-link to="/audiences">Back to audiences</router-link></p>
      <p v-if="pageState.kind === 'loading'">Loading…</p>
      <p v-else-if="pageState.kind === 'error'" role="alert">{{ pageState.message }}</p>
      <template v-else-if="pageState.kind === 'loaded'">
        <h1>{{ pageState.audience.name }}</h1>
        <p v-if="pageState.audience.description">{{ pageState.audience.description }}</p>
        <p>Mode: {{ pageState.audience.membershipMode ?? 'Manual' }}</p>
        <p class="consent-hint">
          Ward ContactConsent is separate from
          <a href="https://account.churchofjesuschrist.org/subscriptions" rel="noopener noreferrer" target="_blank">
            Church Account subscriptions
          </a>.
        </p>
        <h2>Members ({{ pageState.audience.members.length }})</h2>
        <IonList>
          <IonItem v-for="member in pageState.audience.members" :key="member.personId">
            <IonLabel>
              {{ member.displayName }}
              <p v-if="member.source">{{ member.source }}</p>
            </IonLabel>
          </IonItem>
        </IonList>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.consent-hint {
  font-size: 0.875rem;
  color: #57606a;
}
</style>
