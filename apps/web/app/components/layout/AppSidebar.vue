<script setup lang="ts">
import { isNavItemActive } from '~/composables/useAppNavigation';

const route = useRoute();
const { sections, adminItems } = useAppNavigation();
const { state: authState, logout } = useAuth();

const sidebarOpen = ref(false);

const user = computed(() => (authState.value.kind === 'authenticated' ? authState.value.user : null));

function closeSidebar(): void {
  sidebarOpen.value = false;
}

function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value;
}

watch(
  () => route.path,
  () => {
    sidebarOpen.value = false;
  },
);
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--open': sidebarOpen }" aria-label="Primary">
    <div class="sidebar__brand">
      <NuxtLink to="/" class="sidebar__brand-link" @click="closeSidebar">
        <span class="sidebar__brand-mark" aria-hidden="true">WC</span>
        <span class="sidebar__brand-text">Ward Comms</span>
      </NuxtLink>
    </div>

    <nav class="sidebar__nav">
      <div v-for="section in sections" :key="section.id" class="sidebar__section">
        <p class="sidebar__section-label">{{ section.label }}</p>
        <ul class="sidebar__list">
          <li v-for="item in section.items" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="sidebar__link"
              :class="{ 'sidebar__link--active': isNavItemActive(route.path, item) }"
              :aria-current="isNavItemActive(route.path, item) ? 'page' : undefined"
              @click="closeSidebar"
            >
              {{ item.label }}
            </NuxtLink>
          </li>
        </ul>
      </div>

      <div v-if="adminItems.length > 0" class="sidebar__section">
        <p class="sidebar__section-label">Administration</p>
        <ul class="sidebar__list">
          <li v-for="item in adminItems" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="sidebar__link"
              :class="{ 'sidebar__link--active': isNavItemActive(route.path, item) }"
              :aria-current="isNavItemActive(route.path, item) ? 'page' : undefined"
              @click="closeSidebar"
            >
              {{ item.label }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>

    <div v-if="user" class="sidebar__footer">
      <p class="sidebar__user-name">{{ user.displayName }}</p>
      <button type="button" class="sidebar__sign-out" @click="logout">Sign out</button>
    </div>
  </aside>

  <button
    type="button"
    class="sidebar-backdrop"
    :class="{ 'sidebar-backdrop--visible': sidebarOpen }"
    aria-label="Close navigation"
    @click="closeSidebar"
  />

  <header class="mobile-header">
    <button type="button" class="mobile-header__menu" :aria-expanded="sidebarOpen" aria-controls="app-sidebar" @click="toggleSidebar">
      <span class="sr-only">Open navigation</span>
      <span aria-hidden="true">☰</span>
    </button>
    <NuxtLink to="/" class="mobile-header__title">Ward Comms</NuxtLink>
  </header>
</template>

<style scoped>
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 40;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  transform: translateX(-100%);
  transition: transform 0.2s ease;
}

.sidebar--open {
  transform: translateX(0);
}

.sidebar__brand {
  padding: var(--space-5) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.sidebar__brand-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  text-decoration: none;
  color: inherit;
}

.sidebar__brand-link:hover {
  text-decoration: none;
}

.sidebar__brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-md);
  background: var(--color-brand);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 800;
}

.sidebar__brand-text {
  font-size: 1.0625rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.sidebar__section-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-subtle);
  margin-bottom: var(--space-2);
}

.sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sidebar__link {
  display: block;
  padding: 0.625rem 0.75rem;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-weight: 600;
  text-decoration: none;
}

.sidebar__link:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
  text-decoration: none;
}

.sidebar__link--active {
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.sidebar__footer {
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.sidebar__user-name {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.sidebar__sign-out {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
}

.sidebar-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  border: 0;
  background: rgb(26 35 50 / 0.45);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.sidebar-backdrop--visible {
  opacity: 1;
  pointer-events: auto;
}

.mobile-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: var(--header-height);
  padding: 0 var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.mobile-header__menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: 1.125rem;
  cursor: pointer;
}

.mobile-header__title {
  font-weight: 700;
  color: inherit;
  text-decoration: none;
}

@media (min-width: 960px) {
  .sidebar {
    transform: none;
  }

  .sidebar-backdrop,
  .mobile-header {
    display: none;
  }
}
</style>
