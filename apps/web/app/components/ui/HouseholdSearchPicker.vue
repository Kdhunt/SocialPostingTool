<script setup lang="ts">
import { ApiRequestError } from '@ward-comms/api-client';
import type { HouseholdListResponse } from '@ward-comms/validation';

type HouseholdSummary = HouseholdListResponse['households'][number];

const props = withDefaults(
  defineProps<{
    inputId: string;
    label?: string;
    disabled?: boolean;
  }>(),
  {
    label: 'Choose a household',
    disabled: false,
  },
);

const emit = defineEmits<{
  select: [householdId: string, householdName: string];
}>();

const client = useApiClient();
const filter = ref('');
const households = ref<HouseholdSummary[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const selectedLabel = ref<string | null>(null);

const filteredHouseholds = computed(() => {
  const term = filter.value.trim().toLowerCase();
  if (!term) return households.value.slice(0, 12);
  return households.value.filter((household) => household.name.toLowerCase().includes(term)).slice(0, 12);
});

onMounted(async () => {
  loading.value = true;
  try {
    const response = await client.listHouseholds();
    households.value = response.households;
  } catch (error) {
    loadError.value = error instanceof ApiRequestError ? error.message : 'Unable to load households.';
  } finally {
    loading.value = false;
  }
});

function chooseHousehold(household: HouseholdSummary): void {
  selectedLabel.value = household.name;
  filter.value = household.name;
  emit('select', household.id, household.name);
}

function clearSelection(): void {
  filter.value = '';
  selectedLabel.value = null;
}
</script>

<template>
  <div class="picker">
    <label class="form-label" :for="inputId">{{ label }}</label>
    <div class="picker__row">
      <input
        :id="inputId"
        v-model="filter"
        class="form-control"
        type="search"
        placeholder="Filter households…"
        :disabled="disabled || loading"
        autocomplete="off"
      />
      <UiAppButton v-if="selectedLabel" variant="ghost" type="button" :disabled="disabled" @click="clearSelection">
        Clear
      </UiAppButton>
    </div>
    <p v-if="selectedLabel" class="picker__selected">Selected: {{ selectedLabel }}</p>
    <UiLoadingState v-if="loading" message="Loading households…" />
    <UiAlertBanner v-else-if="loadError" tone="warning">{{ loadError }}</UiAlertBanner>
    <ul v-else-if="filteredHouseholds.length > 0" class="picker__results" role="listbox" :aria-label="label">
      <li v-for="household in filteredHouseholds" :key="household.id">
        <button type="button" class="picker__option" role="option" :disabled="disabled" @click="chooseHousehold(household)">
          {{ household.name }}
        </button>
      </li>
    </ul>
    <p v-else class="picker__empty">No households match.</p>
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

.picker__empty {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.picker__results {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  max-height: 14rem;
  overflow-y: auto;
}

.picker__option {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  font-weight: 600;
}

.picker__option:last-child {
  border-bottom: 0;
}

.picker__option:hover:not(:disabled) {
  background: var(--color-brand-soft);
}
</style>
