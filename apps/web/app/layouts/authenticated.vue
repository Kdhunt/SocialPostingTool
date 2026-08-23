<script setup lang="ts">
const { refreshSession } = useAuth();

onMounted(() => {
  void refreshSession();
});
</script>

<template>
  <div class="app-shell">
    <LayoutAppSidebar />
    <div class="app-shell__main">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-shell__main {
  min-height: 100vh;
}

@media (min-width: 960px) {
  .app-shell__main {
    margin-left: var(--sidebar-width);
  }
}
</style>
