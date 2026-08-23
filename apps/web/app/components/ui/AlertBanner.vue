<script setup lang="ts">
defineProps<{
  tone?: 'error' | 'warning' | 'info' | 'success';
}>();
</script>

<template>
  <div class="alert" :class="tone ? `alert--${tone}` : 'alert--error'" role="alert">
    <slot />
  </div>
</template>

<style scoped>
.alert {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: 0.9375rem;
}

.alert--error {
  color: var(--color-danger);
  background: var(--color-danger-soft);
  border-color: rgb(207 34 46 / 0.25);
}

.alert--warning {
  color: var(--color-warning);
  background: var(--color-warning-soft);
  border-color: rgb(154 103 0 / 0.25);
}

.alert--info {
  color: var(--color-brand);
  background: var(--color-brand-soft);
  border-color: rgb(30 77 140 / 0.2);
}

.alert--success {
  color: var(--color-success);
  background: var(--color-success-soft);
  border-color: rgb(26 127 55 / 0.25);
}
</style>
