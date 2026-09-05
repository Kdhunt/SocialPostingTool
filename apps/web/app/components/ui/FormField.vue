<script setup lang="ts">
defineProps<{
  label: string;
  inputId: string;
  hint?: string;
  error?: string;
}>();
</script>

<template>
  <div class="field">
    <label class="form-label" :for="inputId">{{ label }}</label>
    <slot />
    <p v-if="hint" :id="`${inputId}-hint`" class="field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${inputId}-error`" class="field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field__hint {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.field__error {
  font-size: 0.8125rem;
  color: var(--color-danger);
  font-weight: 600;
}
</style>
