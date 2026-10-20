<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

const { adminItems, isPlatformOperator } = useAppNavigation();

const description = computed(() =>
  isPlatformOperator.value
    ? 'Create wards, stakes, regions and districts, and manage each unit’s administrators. Directory and campaigns stay in each unit’s login.'
    : 'Manage users, sign-in code, the units beneath yours, provider credentials, and audit history.',
);
</script>

<template>
  <LayoutPageContainer>
    <LayoutPageHeader title="Administration" :description="description" />
    <LayoutSectionSubnav v-if="adminItems.length > 0" :items="adminItems" />
    <NuxtPage />
  </LayoutPageContainer>
</template>
