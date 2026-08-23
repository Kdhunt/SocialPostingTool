<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

const { adminItems } = useAppNavigation();
</script>

<template>
  <LayoutPageContainer>
    <LayoutPageHeader title="Administration" description="Manage users, ward access, provider credentials, and audit history." />
    <LayoutSectionSubnav v-if="adminItems.length > 0" :items="adminItems" />
    <NuxtPage />
  </LayoutPageContainer>
</template>
