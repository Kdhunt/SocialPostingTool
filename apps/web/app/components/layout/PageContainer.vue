<script setup lang="ts">
defineProps<{
  narrow?: boolean;
}>();
</script>

<template>
  <div class="page-container" :class="{ 'page-container--narrow': narrow }">
    <slot />
  </div>
</template>

<style scoped>
.page-container {
  width: 100%;
  max-width: var(--content-max);
  margin-inline: auto;
  padding: var(--space-6) var(--space-5) var(--space-10);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.page-container--narrow {
  max-width: 40rem;
}

@media (max-width: 768px) {
  .page-container {
    padding: var(--space-5) var(--space-4) var(--space-8);
  }
}
</style>
