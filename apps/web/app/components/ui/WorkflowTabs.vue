<script setup lang="ts">
export interface WorkflowTab {
  id: string;
  label: string;
  description?: string;
}

const props = defineProps<{
  tabs: WorkflowTab[];
}>();

const activeTab = defineModel<string>({ required: true });

function selectTab(tabId: string): void {
  activeTab.value = tabId;
}

function tabIndex(tabId: string): number {
  return props.tabs.findIndex((tab) => tab.id === tabId);
}
</script>

<template>
  <div class="workflow-tabs">
    <div class="workflow-tabs__list" role="tablist" aria-label="Campaign steps">
      <button
        v-for="(tab, index) in tabs"
        :id="`tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        class="workflow-tabs__tab"
        :class="{ 'workflow-tabs__tab--active': activeTab === tab.id }"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        @click="selectTab(tab.id)"
        @keydown.arrow-right.prevent="selectTab(tabs[(index + 1) % tabs.length]?.id ?? tab.id)"
        @keydown.arrow-left.prevent="selectTab(tabs[(index - 1 + tabs.length) % tabs.length]?.id ?? tab.id)"
      >
        <span class="workflow-tabs__step">{{ index + 1 }}</span>
        <span class="workflow-tabs__label">{{ tab.label }}</span>
      </button>
    </div>

    <div
      v-for="tab in tabs"
      :id="`panel-${tab.id}`"
      :key="tab.id"
      role="tabpanel"
      class="workflow-tabs__panel card"
      :aria-labelledby="`tab-${tab.id}`"
      :hidden="activeTab !== tab.id"
    >
      <p v-if="tab.description" class="workflow-tabs__description">{{ tab.description }}</p>
      <slot :name="tab.id" />
    </div>
  </div>
</template>

<style scoped>
.workflow-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.workflow-tabs__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--space-2);
}

.workflow-tabs__tab {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
}

.workflow-tabs__tab--active {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
}

.workflow-tabs__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: var(--color-surface-muted);
  font-size: 0.75rem;
  font-weight: 800;
  flex-shrink: 0;
}

.workflow-tabs__tab--active .workflow-tabs__step {
  background: var(--color-brand);
  color: #fff;
}

.workflow-tabs__label {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-text);
}

.workflow-tabs__panel {
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.workflow-tabs__description {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

@media (max-width: 640px) {
  .workflow-tabs__list {
    grid-template-columns: 1fr;
  }
}
</style>
