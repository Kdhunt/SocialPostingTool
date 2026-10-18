<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { mobileAuthStore } from '../auth-store.js';

const router = useRouter();

const unitCode = ref('');
const username = ref('');
const password = ref('');
const totpCode = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

const needsTotp = computed(() => mobileAuthStore.state.value.kind === 'totp_required');

async function onLoginSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  const result = await mobileAuthStore.login(username.value, password.value, unitCode.value);
  submitting.value = false;

  if (!result.ok) {
    errorMessage.value = result.error ?? 'Unable to sign in.';
    return;
  }

  if (mobileAuthStore.state.value.kind === 'authenticated') {
    await router.replace('/home');
  }
}

async function onTotpSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  const result = await mobileAuthStore.submitTotp(totpCode.value);
  submitting.value = false;

  if (!result.ok) {
    errorMessage.value = result.error ?? 'Unable to verify authenticator code.';
    return;
  }

  if (mobileAuthStore.state.value.kind === 'authenticated') {
    await router.replace('/home');
  }
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
      <form v-if="!needsTotp" novalidate @submit.prevent="onLoginSubmit">
        <label for="mobile-unit-code">Unit code (ward, stake, region or district)</label>
        <input id="mobile-unit-code" v-model="unitCode" type="password" autocomplete="off" />

        <label for="mobile-username">Username</label>
        <input id="mobile-username" v-model="username" type="text" autocomplete="username" required />

        <label for="mobile-password">Password</label>
        <input id="mobile-password" v-model="password" type="password" autocomplete="current-password" required />

        <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>

        <button type="submit" :disabled="submitting">{{ submitting ? 'Signing in…' : 'Sign in' }}</button>
      </form>

      <form v-else novalidate @submit.prevent="onTotpSubmit">
        <p>Enter the 6-digit code from your authenticator app.</p>

        <label for="mobile-totp-code">Authenticator code</label>
        <input
          id="mobile-totp-code"
          v-model="totpCode"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="\d{6}"
          maxlength="6"
          required
        />

        <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>

        <button type="submit" :disabled="submitting">{{ submitting ? 'Verifying…' : 'Verify code' }}</button>
      </form>
    </IonContent>
  </IonPage>
</template>
