<script setup lang="ts">
import { computed } from 'vue';
import { useAuth } from '~/composables/useAuth';

const { state: authState, logout } = useAuth();

const user = computed(() => (authState.value.kind === 'authenticated' ? authState.value.user : null));

function hasPermission(key: string): boolean {
  return user.value?.permissions.includes(key) ?? false;
}

const showAdminNav = computed(
  () =>
    hasPermission('users.manage') ||
    hasPermission('ward.manage') ||
    hasPermission('audit.read') ||
    hasPermission('campaigns.send'),
);
</script>

<template>
  <div class="app-shell">
    <header v-if="user" class="app-shell__header">
      <nav class="app-shell__nav" aria-label="Main">
        <NuxtLink to="/" class="app-shell__brand">Ward Comms</NuxtLink>
        <NuxtLink to="/directory">Directory</NuxtLink>
        <NuxtLink to="/audiences">Audiences</NuxtLink>
        <NuxtLink to="/campaigns">Campaigns</NuxtLink>
        <template v-if="showAdminNav">
          <span class="app-shell__divider" aria-hidden="true">|</span>
          <NuxtLink v-if="hasPermission('users.manage')" to="/admin/users">Users</NuxtLink>
          <NuxtLink v-if="hasPermission('ward.manage')" to="/admin/ward-code">Ward code</NuxtLink>
          <NuxtLink v-if="hasPermission('campaigns.send')" to="/admin/provider-credentials">Providers</NuxtLink>
          <NuxtLink v-if="hasPermission('audit.read')" to="/admin/audit">Audit</NuxtLink>
        </template>
      </nav>
      <div class="app-shell__user">
        <span>{{ user.displayName }}</span>
        <button type="button" @click="logout">Sign out</button>
      </div>
    </header>
    <div class="app-shell__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #d0d7de;
  background: #f6f8fa;
  flex-wrap: wrap;
}

.app-shell__nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.app-shell__brand {
  font-weight: 700;
}

.app-shell__divider {
  color: #57606a;
}

.app-shell__user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.app-shell__content {
  flex: 1;
}

a:focus-visible,
button:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
