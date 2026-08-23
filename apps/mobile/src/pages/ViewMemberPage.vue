<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { ApiRequestError } from '@ward-comms/api-client';
import type { PersonDetailDto } from '@ward-comms/validation';
import { mobileAuthStore } from '../auth-store.js';

type PageState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'loaded'; person: PersonDetailDto };

const route = useRoute();
const router = useRouter();
const personId = computed(() => route.params.id as string);

const pageState = ref<PageState>({ kind: 'loading' });
const editing = ref(false);
const editFirstName = ref('');
const editLastName = ref('');
const editPreferredName = ref('');
const saveError = ref<string | null>(null);

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const person = await mobileAuthStore.client.getPerson(personId.value);
    pageState.value = { kind: 'loaded', person };
    editFirstName.value = person.firstName;
    editLastName.value = person.lastName;
    editPreferredName.value = person.preferredName ?? '';
  } catch (error) {
    pageState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load member.',
    };
  }
}

async function saveEdits(): Promise<void> {
  saveError.value = null;
  try {
    const person = await mobileAuthStore.client.updatePerson(personId.value, {
      firstName: editFirstName.value,
      lastName: editLastName.value,
      preferredName: editPreferredName.value || null,
    });
    pageState.value = { kind: 'loaded', person };
    editing.value = false;
  } catch (error) {
    saveError.value = error instanceof ApiRequestError ? error.message : 'Unable to save changes.';
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
        <IonTitle>Member</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p v-if="pageState.kind === 'loading'">Loading…</p>
      <p v-else-if="pageState.kind === 'error'" role="alert">{{ pageState.message }}</p>

      <template v-else-if="pageState.kind === 'loaded'">
        <h2>{{ pageState.person.preferredName ?? `${pageState.person.firstName} ${pageState.person.lastName}` }}</h2>
        <p v-if="pageState.person.isMinor">This member is a minor.</p>
        <p v-if="pageState.person.restricted">
          Date of birth and contact information are restricted for this record on this account.
        </p>

        <div v-if="!editing">
          <p v-if="!pageState.person.restricted && pageState.person.dateOfBirth">
            Date of birth: {{ pageState.person.dateOfBirth }}
          </p>
          <ul v-if="!pageState.person.restricted">
            <li v-for="method in pageState.person.contactMethods" :key="method.id">
              {{ method.type }}: {{ method.value }}
            </li>
          </ul>
          <button type="button" @click="editing = true">Edit</button>
        </div>

        <form v-else novalidate @submit.prevent="saveEdits">
          <label for="mobile-edit-first-name">First name</label>
          <input id="mobile-edit-first-name" v-model="editFirstName" type="text" required />

          <label for="mobile-edit-last-name">Last name</label>
          <input id="mobile-edit-last-name" v-model="editLastName" type="text" required />

          <label for="mobile-edit-preferred-name">Preferred name</label>
          <input id="mobile-edit-preferred-name" v-model="editPreferredName" type="text" />

          <p v-if="saveError" role="alert">{{ saveError }}</p>

          <button type="submit">Save</button>
          <button type="button" @click="editing = false">Cancel</button>
        </form>
      </template>
    </IonContent>
  </IonPage>
</template>
