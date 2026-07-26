import { createRouter, createWebHistory, type Router } from 'vue-router';

export function createAppRouter(): Router {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', redirect: '/home' },
      { path: '/login', component: () => import('./pages/LoginPage.vue') },
      { path: '/home', component: () => import('./pages/HomePage.vue') },
    ],
  });
}
