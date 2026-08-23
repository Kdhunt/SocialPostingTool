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

const activeTab = ref('profile');

const PERSON_TABS = [
  { id: 'profile', label: 'Profile', description: 'Basic information and record status.' },
  { id: 'contact', label: 'Contact & consent', description: 'Email, phone, and communication consent.' },
  { id: 'household', label: 'Household', description: 'Household memberships for this person.' },
  { id: 'family', label: 'Family', description: 'Relationships to other members.' },
] as const;

const breadcrumbs = computed(() => {
  if (pageState.value.kind !== 'loaded') {
    return [{ label: 'Directory', to: '/directory' }, { label: 'Person' }];
  }
  const person = pageState.value.person;
  const name = person.preferredName ?? `${person.firstName} ${person.lastName}`;
  return [{ label: 'Directory', to: '/directory' }, { label: name }];
});

function onRelatedPersonSelected(personId: string): void {
  relatedPersonId.value = personId;
}

function onHouseholdSelected(householdId: string): void {
  householdIdInput.value = householdId;
}

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
  <div class="person-detail">
    <LayoutBreadcrumbs :items="breadcrumbs" />

    <UiLoadingState v-if="pageState.kind === 'loading'" />
    <UiAlertBanner v-else-if="pageState.kind === 'error'">{{ pageState.message }}</UiAlertBanner>

    <template v-else-if="pageState.kind === 'loaded'">
      <LayoutPageHeader :title="pageState.person.preferredName ?? `${pageState.person.firstName} ${pageState.person.lastName}`">
        <template #actions>
          <span v-if="!pageState.person.isActive" class="status-pill status-pill--muted">Inactive</span>
          <span v-if="pageState.person.isMinor" class="status-pill status-pill--warning">Minor</span>
        </template>
      </LayoutPageHeader>

      <UiAlertBanner v-if="actionError">{{ actionError }}</UiAlertBanner>

      <UiAlertBanner v-if="pageState.person.restricted" tone="info">
        Date of birth and contact information are restricted for this record.
      </UiAlertBanner>

      <UiWorkflowTabs v-model="activeTab" :tabs="[...PERSON_TABS]">
        <template #profile>
          <form class="form-stack" novalidate @submit.prevent="saveBasicInfo">
            <UiFormField label="First name" input-id="edit-first-name">
              <input id="edit-first-name" v-model="editFirstName" class="form-control" type="text" required />
            </UiFormField>
            <UiFormField label="Last name" input-id="edit-last-name">
              <input id="edit-last-name" v-model="editLastName" class="form-control" type="text" required />
            </UiFormField>
            <UiFormField label="Preferred name" input-id="edit-preferred-name">
              <input id="edit-preferred-name" v-model="editPreferredName" class="form-control" type="text" />
            </UiFormField>
            <UiFormField label="Gender" input-id="edit-gender">
              <select id="edit-gender" v-model="editGender" class="form-control">
                <option value="NotSpecified">Not specified</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </UiFormField>
            <UiFormField v-if="!pageState.person.restricted" label="Date of birth" input-id="edit-dob">
              <input id="edit-dob" v-model="editDateOfBirth" class="form-control" type="date" />
            </UiFormField>
            <div class="button-row">
              <UiAppButton type="submit">Save profile</UiAppButton>
              <UiAppButton v-if="pageState.person.isActive" variant="secondary" type="button" @click="archivePerson">Mark inactive</UiAppButton>
              <UiAppButton v-else variant="secondary" type="button" @click="restorePerson">Mark active</UiAppButton>
            </div>
          </form>
        </template>

        <template #contact>
          <template v-if="!pageState.person.restricted">
            <ul class="item-list">
              <li v-for="method in pageState.person.contactMethods" :key="method.id" class="item-list__row">
                <div>
                  <strong>{{ method.type }}:</strong> {{ method.value }}
                  <p class="hint">Consent: {{ method.consent?.status ?? 'Not recorded' }}</p>
                </div>
                <div class="button-row">
                  <UiAppButton variant="ghost" type="button" @click="grantConsent(method.id)">Grant</UiAppButton>
                  <UiAppButton variant="ghost" type="button" @click="denyConsent(method.id)">Deny</UiAppButton>
                  <UiAppButton variant="ghost" type="button" @click="archiveContactMethod(method.id)">Remove</UiAppButton>
                </div>
              </li>
            </ul>
            <form class="form-stack" novalidate @submit.prevent="addContactMethod">
              <UiFormField label="Type" input-id="contact-type">
                <select id="contact-type" v-model="contactType" class="form-control">
                  <option value="Email">Email</option>
                  <option value="Phone">Phone</option>
                </select>
              </UiFormField>
              <UiFormField label="Value" input-id="contact-value">
                <input id="contact-value" v-model="contactValue" class="form-control" type="text" required />
              </UiFormField>
              <UiAppButton type="submit">Add contact method</UiAppButton>
            </form>
          </template>
          <UiAlertBanner v-else tone="info">Contact details are hidden for this restricted record.</UiAlertBanner>
        </template>

        <template #household>
          <ul class="item-list">
            <li v-for="membership in pageState.person.householdMemberships" :key="membership.id" class="item-list__row">
              <div>
                <NuxtLink :to="`/directory/households/${membership.householdId}`">{{ membership.householdName }}</NuxtLink>
                <p class="hint">{{ membership.householdRole }}</p>
              </div>
              <UiAppButton v-if="!membership.endedAt" variant="ghost" type="button" @click="endHouseholdMembership(membership.id)">
                End membership
              </UiAppButton>
              <span v-else class="status-pill status-pill--muted">Ended</span>
            </li>
          </ul>
          <form class="form-stack" novalidate @submit.prevent="addHouseholdMembership">
            <UiHouseholdSearchPicker input-id="household-picker" @select="onHouseholdSelected" />
            <label class="checkbox-row">
              <input v-model="endOtherMemberships" type="checkbox" />
              End other current household memberships
            </label>
            <UiAppButton type="submit" :disabled="!householdIdInput">Add to household</UiAppButton>
          </form>
        </template>

        <template #family>
          <ul class="item-list">
            <li v-for="relationship in pageState.person.relationships" :key="relationship.id" class="item-list__row">
              <span>
                {{ relationship.relationshipType }} of
                <NuxtLink :to="`/directory/people/${relationship.relatedPersonId}`">{{ relationship.relatedPersonDisplayName }}</NuxtLink>
              </span>
              <UiAppButton variant="ghost" type="button" @click="archiveRelationship(relationship.id)">End relationship</UiAppButton>
            </li>
          </ul>
          <form class="form-stack" novalidate @submit.prevent="addRelationship">
            <UiPersonSearchPicker input-id="related-person-picker" label="Search for related person" @select="onRelatedPersonSelected" />
            <UiFormField label="Relationship" input-id="relationship-type">
              <select id="relationship-type" v-model="relationshipType" class="form-control">
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
            </UiFormField>
            <UiAppButton type="submit" :disabled="!relatedPersonId">Add relationship</UiAppButton>
          </form>
        </template>
      </UiWorkflowTabs>
    </template>
  </div>
</template>

<style scoped>
.person-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.status-pill {
  font-size: 0.8125rem;
  font-weight: 700;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.status-pill--muted {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}

.status-pill--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 32rem;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.item-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.hint {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9375rem;
}
</style>
