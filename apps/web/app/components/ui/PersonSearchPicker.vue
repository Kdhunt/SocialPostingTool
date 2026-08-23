<script setup lang="ts">
import { ApiRequestError } from '@ward-comms/api-client';
import type { PersonSummaryDto } from '@ward-comms/validation';

const props = withDefaults(
  defineProps<{
    inputId: string;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    label: 'Search for a person',
    placeholder: 'Type a name…',
    disabled: false,
  },
);

const emit = defineEmits<{
  select: [personId: string, displayName: string];
}>();

const client = useApiClient();
const query = ref('');
const results = ref<PersonSummaryDto[]>([]);
const searching = ref(false);
const searchError = ref<string | null>(null);
const selectedLabel = ref<string | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function runSearch(searchQuery: string): Promise<void> {
  if (!searchQuery.trim()) {
    results.value = [];
    return;
  }

  searching.value = true;
  searchError.value = null;
  try {
    const { people } = await client.searchPeople({ query: searchQuery.trim(), limit: 8 });
    results.value = people;
  } catch (error) {
    searchError.value = error instanceof ApiRequestError ? error.message : 'Unable to search.';
    results.value = [];
  } finally {
    searching.value = false;
  }
}

function onInput(): void {
  selectedLabel.value = null;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void runSearch(query.value);
  }, 300);
}

function choosePerson(person: PersonSummaryDto): void {
  const displayName = person.preferredName ?? `${person.firstName} ${person.lastName}`;
  selectedLabel.value = displayName;
  query.value = displayName;
  results.value = [];
  emit('select', person.id, displayName);
}

function clearSelection(): void {
  query.value = '';
  selectedLabel.value = null;
  results.value = [];
}
</script>

<template>
  <div class="picker">
    <label class="form-label" :for="inputId">{{ label }}</label>
    <div class="picker__row">
      <input
        :id="inputId"
        v-model="query"
        class="form-control"
        type="search"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
        @input="onInput"
      />
      <UiAppButton v-if="selectedLabel" variant="ghost" type="button" :disabled="disabled" @click="clearSelection">
        Clear
      </UiAppButton>
    </div>
    <p v-if="selectedLabel" class="picker__selected">Selected: {{ selectedLabel }}</p>
    <UiLoadingState v-if="searching" message="Searching…" />
    <UiAlertBanner v-else-if="searchError" tone="warning">{{ searchError }}</UiAlertBanner>
    <ul v-else-if="results.length > 0" class="picker__results" role="listbox" :aria-label="label">
      <li v-for="person in results" :key="person.id">
        <button type="button" class="picker__option" role="option" :disabled="disabled" @click="choosePerson(person)">
          <span class="picker__name">{{ person.preferredName ?? `${person.firstName} ${person.lastName}` }}</span>
          <span v-if="person.primaryHouseholdName" class="picker__meta">{{ person.primaryHouseholdName }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.picker__row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.picker__row .form-control {
  flex: 1;
}

.picker__selected {
  font-size: 0.875rem;
  color: var(--color-success);
  font-weight: 600;
}

.picker__results {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.picker__option {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
}

.picker__option:last-child {
  border-bottom: 0;
}

.picker__option:hover:not(:disabled) {
  background: var(--color-brand-soft);
}

.picker__name {
  font-weight: 600;
}

.picker__meta {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
</style>
