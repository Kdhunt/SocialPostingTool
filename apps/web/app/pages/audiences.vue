<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

const audienceSubnav = [
  {
    label: 'Groups',
    to: '/audiences',
    isActive: (path: string) =>
      path === '/audiences' || (path.startsWith('/audiences/') && !path.startsWith('/audiences/destinations')),
  },
  { label: 'Destinations', to: '/audiences/destinations', matchPrefix: '/audiences/destinations' },
];
</script>

<template>
  <LayoutPageContainer>
    <LayoutSectionSubnav :items="audienceSubnav" />
    <NuxtPage />
  </LayoutPageContainer>
</template>
