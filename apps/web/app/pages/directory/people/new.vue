<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const firstName = ref('');
const lastName = ref('');
const preferredName = ref('');
const gender = ref<'Male' | 'Female' | 'NotSpecified'>('NotSpecified');
const dateOfBirth = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
  }
});

async function onSubmit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  try {
    const person = await client.createPerson({
      firstName: firstName.value,
      lastName: lastName.value,
      preferredName: preferredName.value || undefined,
      gender: gender.value,
      dateOfBirth: dateOfBirth.value || undefined,
    });
    await navigateTo(`/directory/people/${person.id}`);
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : 'Unable to create person.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="person-new-page">
    <h1>Add person</h1>

    <form class="person-new-page__form" novalidate @submit.prevent="onSubmit">
      <label for="first-name">First name</label>
      <input id="first-name" v-model="firstName" type="text" required />

      <label for="last-name">Last name</label>
      <input id="last-name" v-model="lastName" type="text" required />

      <label for="preferred-name">Preferred name (optional)</label>
      <input id="preferred-name" v-model="preferredName" type="text" />

      <label for="gender">Gender</label>
      <select id="gender" v-model="gender">
        <option value="NotSpecified">Not specified</option>
        <option value="Female">Female</option>
        <option value="Male">Male</option>
      </select>

      <label for="date-of-birth">Date of birth (optional)</label>
      <input id="date-of-birth" v-model="dateOfBirth" type="date" />

      <p v-if="errorMessage" role="alert" class="person-new-page__error">{{ errorMessage }}</p>

      <button type="submit" :disabled="submitting">{{ submitting ? 'Saving…' : 'Save' }}</button>
    </form>
  </main>
</template>

<style scoped>
.person-new-page {
  max-width: 28rem;
  margin: 2rem auto;
  padding: 0 1rem;
}

.person-new-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 1rem;
}

.person-new-page__form label {
  font-weight: 600;
  margin-top: 0.5rem;
}

.person-new-page__form input,
.person-new-page__form select {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-size: 1rem;
}

.person-new-page__form button {
  margin-top: 1rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  border: none;
  background-color: #0969da;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.person-new-page__error {
  color: #cf222e;
  font-weight: 600;
}

input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
