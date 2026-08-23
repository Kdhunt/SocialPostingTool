<script setup lang="ts">
defineProps<{
  title: string;
  to: string;
  description: string;
}>();
</script>

<template>
  <NuxtLink :to="to" class="action-card">
    <h3 class="action-card__title">{{ title }}</h3>
    <p class="action-card__description">{{ description }}</p>
    <span class="action-card__cta" aria-hidden="true">Open →</span>
  </NuxtLink>
</template>

<style scoped>
.action-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  color: inherit;
  min-height: 8rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.action-card:hover {
  border-color: var(--color-brand);
  box-shadow: var(--shadow-md);
  text-decoration: none;
}

.action-card__title {
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--color-brand);
}

.action-card__description {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  flex: 1;
}

.action-card__cta {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-accent);
}
</style>
