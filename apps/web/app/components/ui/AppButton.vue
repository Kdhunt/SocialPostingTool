<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    to?: string;
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
  },
);
</script>

<template>
  <NuxtLink v-if="to" :to="to" class="btn" :class="`btn--${variant}`">
    <slot />
  </NuxtLink>
  <button v-else class="btn" :class="`btn--${variant}`" :type="type" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0.625rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--color-brand);
  color: #fff;
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-brand-hover);
  text-decoration: none;
}

.btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border-color: var(--color-border-strong);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--color-surface-muted);
  text-decoration: none;
}

.btn--ghost {
  background: transparent;
  color: var(--color-brand);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--color-brand-soft);
  text-decoration: none;
}

.btn--danger {
  background: var(--color-danger);
  color: #fff;
}
</style>
