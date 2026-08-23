<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { ApiRequestError } from '@ward-comms/api-client';
import { mobileAuthStore } from '../auth-store.js';

const router = useRouter();

const firstName = ref('');
const lastName = ref('');
const preferredName = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

onMounted(() => {
  if (mobileAuthStore.state.value.kind !== 'authenticated') {
    void router.replace('/login');
  }
});

async function onSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  try {
    const person = await mobileAuthStore.client.createPerson({
      firstName: firstName.value,
      lastName: lastName.value,
      preferredName: preferredName.value || undefined,
    });
    await router.replace(`/directory/${person.id}`);
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : 'Unable to add member.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Add member</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <form novalidate @submit.prevent="onSubmit">
        <label for="mobile-add-first-name">First name</label>
        <input id="mobile-add-first-name" v-model="firstName" type="text" required />

        <label for="mobile-add-last-name">Last name</label>
        <input id="mobile-add-last-name" v-model="lastName" type="text" required />

        <label for="mobile-add-preferred-name">Preferred name</label>
        <input id="mobile-add-preferred-name" v-model="preferredName" type="text" />

        <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>

        <button type="submit" :disabled="submitting">{{ submitting ? 'Saving…' : 'Save' }}</button>
      </form>
    </IonContent>
  </IonPage>
</template>
