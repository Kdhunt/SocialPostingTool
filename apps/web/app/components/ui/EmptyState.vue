<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <section class="empty">
    <h2 class="empty__title">{{ title }}</h2>
    <p v-if="description" class="empty__description">{{ description }}</p>
    <div v-if="$slots.actions" class="empty__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.empty {
  padding: var(--space-8) var(--space-6);
  text-align: center;
  background: var(--color-surface);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
}

.empty__title {
  font-size: 1.125rem;
  font-weight: 600;
}

.empty__description {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  max-width: 28rem;
  margin-inline: auto;
}

.empty__actions {
  margin-top: var(--space-5);
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
</style>
