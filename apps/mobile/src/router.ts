import { createRouter, createWebHistory, type Router } from 'vue-router';

export function createAppRouter(): Router {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', redirect: '/home' },
      { path: '/login', component: () => import('./pages/LoginPage.vue') },
      { path: '/home', component: () => import('./pages/HomePage.vue') },
      { path: '/directory', component: () => import('./pages/SearchMemberPage.vue') },
      { path: '/directory/new', component: () => import('./pages/AddMemberPage.vue') },
      { path: '/directory/:id', component: () => import('./pages/ViewMemberPage.vue') },
    ],
  });
}
