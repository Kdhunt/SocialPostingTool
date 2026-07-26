<script setup lang="ts">
export type StatusBadgeTone = 'success' | 'warning' | 'error' | 'neutral';

const props = defineProps<{
  tone: StatusBadgeTone;
  label: string;
}>();

const toneIcon: Record<StatusBadgeTone, string> = {
  success: '✓',
  warning: '!',
  error: '✕',
  neutral: '•',
};
</script>

<template>
  <span class="status-badge" :class="`status-badge--${props.tone}`" role="status">
    <span class="status-badge__icon" aria-hidden="true">{{ toneIcon[props.tone] }}</span>
    <span class="status-badge__label">{{ props.label }}</span>
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid currentColor;
}

.status-badge__icon {
  font-weight: 700;
}

.status-badge--success {
  color: #1a7f37;
}

.status-badge--warning {
  color: #9a6700;
}

.status-badge--error {
  color: #cf222e;
}

.status-badge--neutral {
  color: #57606a;
}
</style>
