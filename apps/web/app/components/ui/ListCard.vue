<script setup lang="ts">
defineProps<{
  narrow?: boolean;
}>();
</script>

<template>
  <article class="list-card">
    <div class="list-card__main">
      <slot name="title" />
      <div v-if="$slots.meta" class="list-card__meta">
        <slot name="meta" />
      </div>
    </div>
    <div v-if="$slots.aside" class="list-card__aside">
      <slot name="aside" />
    </div>
  </article>
</template>

<style scoped>
.list-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.list-card__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.list-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.list-card__aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: 0.875rem;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .list-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .list-card__aside {
    align-items: flex-start;
  }
}
</style>
