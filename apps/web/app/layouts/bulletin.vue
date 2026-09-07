<template>
  <div class="bulletin-layout">
    <header class="bulletin-layout__header">
      <NuxtLink to="/" class="bulletin-layout__brand">
        <span class="bulletin-layout__mark" aria-hidden="true">WC</span>
        <span>Ward Communications Hub</span>
      </NuxtLink>
      <NuxtLink to="/login" class="bulletin-layout__sign-in">Sign in</NuxtLink>
    </header>
    <main class="bulletin-layout__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.bulletin-layout {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgb(30 77 140 / 0.1), transparent 40%),
    var(--color-bg);
}

.bulletin-layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.bulletin-layout__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-weight: 700;
  color: var(--color-text);
  text-decoration: none;
}

.bulletin-layout__brand:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 2px;
}

.bulletin-layout__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-md);
  background: var(--color-brand);
  color: #fff;
  font-weight: 800;
  font-size: 0.875rem;
}

.bulletin-layout__sign-in {
  font-weight: 600;
  color: var(--color-brand);
}

.bulletin-layout__sign-in:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 2px;
}

.bulletin-layout__main {
  width: 100%;
  max-width: 42rem;
  margin-inline: auto;
  padding: var(--space-6) var(--space-5) var(--space-10);
}
</style>
