<script setup lang="ts">
import { isNavItemActive, type NavItem } from '~/composables/useAppNavigation';

defineProps<{
  items: NavItem[];
}>();

const route = useRoute();
</script>

<template>
  <nav class="subnav" aria-label="Section">
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="subnav__link"
      :class="{ 'subnav__link--active': isNavItemActive(route.path, item) }"
      :aria-current="isNavItemActive(route.path, item) ? 'page' : undefined"
    >
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>

<style scoped>
.subnav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.subnav__link {
  padding: 0.5rem 0.875rem;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: none;
}

.subnav__link:hover {
  background: var(--color-surface);
  color: var(--color-text);
  text-decoration: none;
}

.subnav__link--active {
  background: var(--color-brand-soft);
  color: var(--color-brand);
}
</style>
