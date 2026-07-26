<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { navigateTo, useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type { PersonDetailDto } from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

type PageState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'loaded'; person: PersonDetailDto };

const route = useRoute();
const personId = route.params.id as string;
const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const pageState = ref<PageState>({ kind: 'loading' });
const actionError = ref<string | null>(null);

const editFirstName = ref('');
const editLastName = ref('');
const editPreferredName = ref('');
const editGender = ref<'Male' | 'Female' | 'NotSpecified'>('NotSpecified');
const editDateOfBirth = ref('');

const contactType = ref<'Email' | 'Phone'>('Email');
const contactValue = ref('');

const relatedPersonId = ref('');
const relationshipType = ref<
  'Husband' | 'Wife' | 'Son' | 'Daughter' | 'Parent' | 'Child' | 'Spouse' | 'Guardian' | 'Dependent' | 'Other' | 'NotSpecified'
>('Spouse');

const householdIdInput = ref('');
const endOtherMemberships = ref(true);

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const person = await client.getPerson(personId);
    pageState.value = { kind: 'loaded', person };
    editFirstName.value = person.firstName;
    editLastName.value = person.lastName;
    editPreferredName.value = person.preferredName ?? '';
    editGender.value = person.gender;
    editDateOfBirth.value = person.dateOfBirth ?? '';
  } catch (error) {
    pageState.value = { kind: 'error', message: error instanceof ApiRequestError ? error.message : 'Unable to load person.' };
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  await load();
});

function withActionErrorHandling(action: () => Promise<PersonDetailDto>): () => Promise<void> {
  return async () => {
    actionError.value = null;
    try {
      const person = await action();
      pageState.value = { kind: 'loaded', person };
    } catch (error) {
      actionError.value = error instanceof ApiRequestError ? error.message : 'Action failed.';
    }
  };
}

const saveBasicInfo = withActionErrorHandling(() =>
  client.updatePerson(personId, {
    firstName: editFirstName.value,
    lastName: editLastName.value,
    preferredName: editPreferredName.value || null,
    gender: editGender.value,
    dateOfBirth: editDateOfBirth.value || null,
  }),
);

const addContactMethod = withActionErrorHandling(async () => {
  const result = await client.addContactMethod(personId, { type: contactType.value, value: contactValue.value });
  contactValue.value = '';
  return result;
});

function archiveContactMethod(contactMethodId: string): Promise<void> {
  return withActionErrorHandling(() => client.archiveContactMethod(personId, contactMethodId))();
}

function grantConsent(contactMethodId: string): Promise<void> {
  return withActionErrorHandling(() => client.setConsent(personId, contactMethodId, { status: 'Granted' }))();
}

function denyConsent(contactMethodId: string): Promise<void> {
  return withActionErrorHandling(() => client.setConsent(personId, contactMethodId, { status: 'Denied' }))();
}

const addRelationship = withActionErrorHandling(async () => {
  const result = await client.addRelationship(personId, {
    relatedPersonId: relatedPersonId.value,
    relationshipType: relationshipType.value,
  });
  relatedPersonId.value = '';
  return result;
});

function archiveRelationship(relationshipId: string): Promise<void> {
  return withActionErrorHandling(() => client.archiveRelationship(personId, relationshipId))();
}

const addHouseholdMembership = withActionErrorHandling(async () => {
  const result = await client.addHouseholdMembership(personId, {
    householdId: householdIdInput.value,
    endOtherCurrentMemberships: endOtherMemberships.value,
  });
  householdIdInput.value = '';
  return result;
});

function endHouseholdMembership(membershipId: string): Promise<void> {
  return withActionErrorHandling(() => client.endHouseholdMembership(personId, membershipId))();
}

const archivePerson = withActionErrorHandling(async () => {
  await client.archivePerson(personId);
  return client.getPerson(personId);
});

const restorePerson = withActionErrorHandling(async () => {
  await client.restorePerson(personId);
  return client.getPerson(personId);
});
</script>

<template>
  <main class="person-page">
    <p><NuxtLink to="/directory">&larr; Back to directory</NuxtLink></p>

    <p v-if="pageState.kind === 'loading'">Loading…</p>
    <p v-else-if="pageState.kind === 'error'" role="alert" class="person-page__error">{{ pageState.message }}</p>

    <template v-else-if="pageState.kind === 'loaded'">
      <header class="person-page__header">
        <h1>{{ pageState.person.preferredName ?? `${pageState.person.firstName} ${pageState.person.lastName}` }}</h1>
        <span v-if="!pageState.person.isActive" class="person-page__tag">Inactive</span>
        <span v-if="pageState.person.isMinor" class="person-page__tag person-page__tag--minor">Minor</span>
      </header>

      <p v-if="actionError" role="alert" class="person-page__error">{{ actionError }}</p>

      <p v-if="pageState.person.restricted" class="person-page__notice">
        Date of birth and contact information are restricted for this record. You need the "view minor contact
        info" permission to see or edit them.
      </p>

      <section aria-labelledby="basic-info-heading">
        <h2 id="basic-info-heading">Basic info</h2>
        <form class="person-page__form" novalidate @submit.prevent="saveBasicInfo">
          <label for="edit-first-name">First name</label>
          <input id="edit-first-name" v-model="editFirstName" type="text" required />

          <label for="edit-last-name">Last name</label>
          <input id="edit-last-name" v-model="editLastName" type="text" required />

          <label for="edit-preferred-name">Preferred name</label>
          <input id="edit-preferred-name" v-model="editPreferredName" type="text" />

          <label for="edit-gender">Gender</label>
          <select id="edit-gender" v-model="editGender">
            <option value="NotSpecified">Not specified</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>

          <template v-if="!pageState.person.restricted">
            <label for="edit-dob">Date of birth</label>
            <input id="edit-dob" v-model="editDateOfBirth" type="date" />
          </template>

          <button type="submit">Save basic info</button>
        </form>

        <button v-if="pageState.person.isActive" type="button" @click="archivePerson">Mark inactive</button>
        <button v-else type="button" @click="restorePerson">Mark active</button>
      </section>

      <section v-if="!pageState.person.restricted" aria-labelledby="contact-heading">
        <h2 id="contact-heading">Contact methods</h2>
        <ul class="person-page__list">
          <li v-for="method in pageState.person.contactMethods" :key="method.id">
            <strong>{{ method.type }}:</strong> {{ method.value }}
            <span v-if="method.isPrimary" class="person-page__tag">Preferred</span>
            <span class="person-page__consent">Consent: {{ method.consent?.status ?? 'Not recorded' }}</span>
            <button type="button" @click="grantConsent(method.id)">Grant consent</button>
            <button type="button" @click="denyConsent(method.id)">Deny consent</button>
            <button type="button" @click="archiveContactMethod(method.id)">Remove</button>
          </li>
        </ul>

        <form class="person-page__inline-form" novalidate @submit.prevent="addContactMethod">
          <label for="contact-type">Type</label>
          <select id="contact-type" v-model="contactType">
            <option value="Email">Email</option>
            <option value="Phone">Phone</option>
          </select>
          <label for="contact-value">Value</label>
          <input id="contact-value" v-model="contactValue" type="text" required />
          <button type="submit">Add contact method</button>
        </form>
      </section>

      <section aria-labelledby="households-heading">
        <h2 id="households-heading">Households</h2>
        <ul class="person-page__list">
          <li v-for="membership in pageState.person.householdMemberships" :key="membership.id">
            <NuxtLink :to="`/directory/households/${membership.householdId}`">{{ membership.householdName }}</NuxtLink>
            ({{ membership.householdRole }})
            <span v-if="membership.endedAt" class="person-page__tag">Ended</span>
            <button v-else type="button" @click="endHouseholdMembership(membership.id)">End membership</button>
          </li>
        </ul>

        <form class="person-page__inline-form" novalidate @submit.prevent="addHouseholdMembership">
          <label for="household-id">Household ID</label>
          <input id="household-id" v-model="householdIdInput" type="text" required />
          <label class="person-page__checkbox">
            <input v-model="endOtherMemberships" type="checkbox" />
            End other current household memberships
          </label>
          <button type="submit">Add to household</button>
        </form>
      </section>

      <section aria-labelledby="relationships-heading">
        <h2 id="relationships-heading">Family relationships</h2>
        <ul class="person-page__list">
          <li v-for="relationship in pageState.person.relationships" :key="relationship.id">
            {{ relationship.relationshipType }} of
            <NuxtLink :to="`/directory/people/${relationship.relatedPersonId}`">{{ relationship.relatedPersonDisplayName }}</NuxtLink>
            <button type="button" @click="archiveRelationship(relationship.id)">End relationship</button>
          </li>
        </ul>

        <form class="person-page__inline-form" novalidate @submit.prevent="addRelationship">
          <label for="related-person-id">Related person ID</label>
          <input id="related-person-id" v-model="relatedPersonId" type="text" required />
          <label for="relationship-type">Relationship</label>
          <select id="relationship-type" v-model="relationshipType">
            <option value="Spouse">Spouse</option>
            <option value="Husband">Husband</option>
            <option value="Wife">Wife</option>
            <option value="Parent">Parent</option>
            <option value="Child">Child</option>
            <option value="Son">Son</option>
            <option value="Daughter">Daughter</option>
            <option value="Guardian">Guardian</option>
            <option value="Dependent">Dependent</option>
            <option value="Other">Other</option>
          </select>
          <button type="submit">Add relationship</button>
        </form>
      </section>
    </template>
  </main>
</template>

<style scoped>
.person-page {
  max-width: 40rem;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.person-page__header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.person-page__form,
.person-page__inline-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0;
}

.person-page__form {
  flex-direction: column;
  align-items: stretch;
  max-width: 24rem;
}

.person-page__form input,
.person-page__form select,
.person-page__inline-form input,
.person-page__inline-form select {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.person-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.person-page__list li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.person-page__checkbox {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.person-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #eaeef2;
  border: 1px solid #57606a;
}

.person-page__tag--minor {
  background: #fff8c5;
  border-color: #9a6700;
}

.person-page__consent {
  color: #57606a;
  font-size: 0.875rem;
}

.person-page__error {
  color: #cf222e;
  font-weight: 600;
}

.person-page__notice {
  background: #fff8c5;
  border: 1px solid #9a6700;
  border-radius: 0.375rem;
  padding: 0.75rem;
}

button {
  cursor: pointer;
}

a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
