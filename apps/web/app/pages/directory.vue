<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

const directorySubnav = [
  {
    label: 'People',
    to: '/directory',
    isActive: (path: string) => path === '/directory' || path.startsWith('/directory/people'),
  },
  { label: 'Households', to: '/directory/households', matchPrefix: '/directory/households' },
];
</script>

<template>
  <LayoutPageContainer>
    <LayoutSectionSubnav :items="directorySubnav" />
    <NuxtPage />
  </LayoutPageContainer>
</template>
