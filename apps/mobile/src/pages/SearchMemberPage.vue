<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonHeader, IonList, IonItem, IonLabel, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { ApiRequestError } from '@ward-comms/api-client';
import type { PersonSummaryDto } from '@ward-comms/validation';
import { mobileAuthStore } from '../auth-store.js';

type ListState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; people: PersonSummaryDto[] };

const router = useRouter();
const query = ref('');
const listState = ref<ListState>({ kind: 'idle' });

async function search(): Promise<void> {
  listState.value = { kind: 'loading' };
  try {
    const { people } = await mobileAuthStore.client.searchPeople({ query: query.value || undefined, limit: 50 });
    listState.value = { kind: 'loaded', people };
  } catch (error) {
    listState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to search the directory.',
    };
  }
}

function viewMember(personId: string): void {
  void router.push(`/directory/${personId}`);
}

onMounted(() => {
  if (mobileAuthStore.state.value.kind !== 'authenticated') {
    void router.replace('/login');
    return;
  }
  void search();
});
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Search member</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <form novalidate @submit.prevent="search">
        <label for="member-search">Name</label>
        <input id="member-search" v-model="query" type="search" placeholder="e.g. Doe" />
        <button type="submit">Search</button>
      </form>

      <router-link to="/directory/new">Add member</router-link>

      <p v-if="listState.kind === 'loading'">Searching…</p>
      <p v-else-if="listState.kind === 'error'" role="alert">{{ listState.message }}</p>
      <p v-else-if="listState.kind === 'loaded' && listState.people.length === 0">No members found.</p>

      <IonList v-else-if="listState.kind === 'loaded'">
        <IonItem v-for="person in listState.people" :key="person.id" button @click="viewMember(person.id)">
          <IonLabel>
            {{ person.preferredName ?? `${person.firstName} ${person.lastName}` }}
            <span v-if="person.isMinor"> (Minor)</span>
            <span v-if="!person.isActive"> (Inactive)</span>
          </IonLabel>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>
