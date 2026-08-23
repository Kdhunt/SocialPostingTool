<script setup lang="ts">
defineProps<{
  message?: string;
}>();
</script>

<template>
  <div class="loading" role="status" aria-live="polite">
    <span class="loading__spinner" aria-hidden="true" />
    <span>{{ message ?? 'Loading…' }}</span>
  </div>
</template>

<style scoped>
.loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6);
  color: var(--color-text-muted);
}

.loading__spinner {
  width: 1.125rem;
  height: 1.125rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
