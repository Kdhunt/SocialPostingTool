<script setup lang="ts">
export interface BreadcrumbItem {
  label: string;
  to?: string;
}

defineProps<{
  items: BreadcrumbItem[];
}>();
</script>

<template>
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol class="breadcrumbs__list">
      <li v-for="(item, index) in items" :key="`${item.label}-${index}`" class="breadcrumbs__item">
        <NuxtLink v-if="item.to && index < items.length - 1" :to="item.to" class="breadcrumbs__link">
          {{ item.label }}
        </NuxtLink>
        <span v-else class="breadcrumbs__current" aria-current="page">{{ item.label }}</span>
        <span v-if="index < items.length - 1" class="breadcrumbs__sep" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.breadcrumbs__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.875rem;
}

.breadcrumbs__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.breadcrumbs__link {
  color: var(--color-text-muted);
  text-decoration: none;
}

.breadcrumbs__link:hover {
  color: var(--color-brand);
  text-decoration: underline;
}

.breadcrumbs__current {
  color: var(--color-text);
  font-weight: 600;
}

.breadcrumbs__sep {
  color: var(--color-text-subtle);
}
</style>
