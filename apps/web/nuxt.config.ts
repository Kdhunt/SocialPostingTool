import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  nitro: {
    preset: 'vercel',
  },
  devServer: {
    port: process.env.WEB_PORT ? Number(process.env.WEB_PORT) : 3000,
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
  runtimeConfig: {
    public: {
      // Same-origin on Vercel (see vercel.json rewrites). Override for split-domain deploys.
      apiBaseUrl:
        process.env.NUXT_PUBLIC_API_BASE_URL ??
        (process.env.VERCEL ? '' : 'http://localhost:3001'),
    },
  },
  app: {
    head: {
      title: 'Ward Communications Hub',
      meta: [{ name: 'description', content: 'Ward Communications Hub web application' }],
    },
  },
});
