import { defineNuxtRouteMiddleware, navigateTo } from '#imports';
import { useAuth } from '~/composables/useAuth';

/**
 * Signed-in pages (layout "authenticated", set on the page or its parent
 * route) need a session. The check runs once and is reused across
 * navigations (see useAuth.ensureSession), so pages no longer each ask the
 * API whether the user is signed in before loading their own data.
 *
 * Runs in the browser only: the session cookie belongs to the API origin,
 * and pages load their data client-side.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // Check every matched record: a child page's own meta can mask the
  // layout its parent route (e.g. pages/directory.vue) declares.
  const needsSession = to.matched.some((record) => record.meta.layout === 'authenticated');
  if (import.meta.server || !needsSession) {
    return;
  }
  const state = await useAuth().ensureSession();
  if (state.kind !== 'authenticated') {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? undefined : { redirect: to.fullPath } });
  }
});
