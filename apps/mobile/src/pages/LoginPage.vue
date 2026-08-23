<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { mobileAuthStore } from '../auth-store.js';

const router = useRouter();

const username = ref('');
const password = ref('');
const wardCode = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

async function onLoginSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  const result = await mobileAuthStore.login(username.value, password.value);
  submitting.value = false;

  if (!result.ok) {
    errorMessage.value = result.error ?? 'Unable to sign in.';
    return;
  }

  if (mobileAuthStore.state.value.kind === 'authenticated') {
    await router.replace('/home');
  }
}

async function onWardCodeSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  const result = await mobileAuthStore.submitWardCode(wardCode.value);
  submitting.value = false;

  if (!result.ok) {
    errorMessage.value = result.error ?? 'Unable to verify ward code.';
    return;
  }

  await router.replace('/home');
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Sign in</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <form v-if="mobileAuthStore.state.value.kind !== 'ward_code_required'" novalidate @submit.prevent="onLoginSubmit">
        <label for="mobile-username">Username</label>
        <input id="mobile-username" v-model="username" type="text" autocomplete="username" required />

        <label for="mobile-password">Password</label>
        <input id="mobile-password" v-model="password" type="password" autocomplete="current-password" required />

        <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>

        <button type="submit" :disabled="submitting">{{ submitting ? 'Signing in…' : 'Sign in' }}</button>
      </form>

      <form v-else novalidate @submit.prevent="onWardCodeSubmit">
        <p>This device needs the current ward code to finish signing in.</p>

        <label for="mobile-ward-code">Ward code</label>
        <input id="mobile-ward-code" v-model="wardCode" type="password" autocomplete="off" required />

        <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>

        <button type="submit" :disabled="submitting">{{ submitting ? 'Verifying…' : 'Verify ward code' }}</button>
      </form>
    </IonContent>
  </IonPage>
</template>
