<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div class="page-header__text">
      <h1 class="page-header__title">{{ title }}</h1>
      <p v-if="description" class="page-header__description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.page-header__title {
  font-size: clamp(1.5rem, 2vw, 1.875rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.page-header__description {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  max-width: 42rem;
}

.page-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
