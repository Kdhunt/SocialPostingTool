<script setup lang="ts">
// Signed-in pages depend on the session, which is only known in the browser. Render the shell after
// hydration so the server's signed-out markup never gets reused for a signed-in view (stale labels and
// attributes survive a hydration mismatch). Client-side navigation is unaffected: the layout is already mounted.
const nuxtApp = useNuxtApp();
const ready = ref(import.meta.client && !nuxtApp.isHydrating);

onMounted(() => {
  ready.value = true;
});
</script>

<template>
  <div class="app-shell">
    <template v-if="ready">
      <LayoutAppSidebar />
      <div class="app-shell__main">
        <slot />
      </div>
    </template>
    <div v-else class="app-shell__loading" role="status" aria-live="polite">Loading…</div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-shell__main {
  min-height: 100vh;
}

.app-shell__loading {
  display: grid;
  place-items: center;
  min-height: 100vh;
  color: var(--color-text-muted);
}

@media (min-width: 960px) {
  .app-shell__main {
    margin-left: var(--sidebar-width);
  }
}
</style>
