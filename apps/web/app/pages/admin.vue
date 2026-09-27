<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

const { adminItems, isPlatformOperator } = useAppNavigation();

const description = computed(() =>
  isPlatformOperator.value
    ? 'Create wards and manage each ward’s administrators. Directory and campaigns stay in each ward login.'
    : 'Manage users, ward access, provider credentials, and audit history.',
);
</script>

<template>
  <LayoutPageContainer>
    <LayoutPageHeader title="Administration" :description="description" />
    <LayoutSectionSubnav v-if="adminItems.length > 0" :items="adminItems" />
    <NuxtPage />
  </LayoutPageContainer>
</template>
