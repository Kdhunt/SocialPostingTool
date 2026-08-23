<template>
  <div class="guest-layout">
    <main class="guest-layout__main">
      <div class="guest-layout__brand">
        <span class="guest-layout__mark" aria-hidden="true">WC</span>
        <div>
          <p class="guest-layout__title">Ward Communications Hub</p>
          <p class="guest-layout__subtitle">Secure ward messaging and directory tools</p>
        </div>
      </div>
      <div class="guest-layout__card card">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.guest-layout {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--space-6) var(--space-4);
  background:
    radial-gradient(circle at top left, rgb(30 77 140 / 0.12), transparent 40%),
    radial-gradient(circle at bottom right, rgb(13 115 119 / 0.1), transparent 35%),
    var(--color-bg);
}

.guest-layout__main {
  width: 100%;
  max-width: 28rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.guest-layout__brand {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.guest-layout__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-lg);
  background: var(--color-brand);
  color: #fff;
  font-weight: 800;
}

.guest-layout__title {
  font-size: 1.25rem;
  font-weight: 700;
}

.guest-layout__subtitle {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.guest-layout__card {
  padding: var(--space-6);
}
</style>
