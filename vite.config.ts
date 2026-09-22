import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// During local dev we proxy /api so the browser stays same-origin (mirrors
// production nginx). Default is the public HTTPS site — the Hostinger
// firewall drops raw :3000. Point VITE_DEV_API_TARGET at localhost:3000
// when developing against a local API (the /nexusai prefix is then stripped).
const apiTarget = process.env.VITE_DEV_API_TARGET || 'https://monishlabs.com';
const targetingRawApi = /localhost|127\.0\.0\.1|:\d{4,5}(?:\/|$)/.test(
  apiTarget.replace(/^https?:\/\//, ''),
);

export default defineConfig({
  // The app is served under the /nexusai/ subpath in production
  // (https://monishlabs.com/nexusai). This makes Vite emit asset URLs and
  // import.meta.env.BASE_URL relative to that prefix, and the router/API base
  // derive from it, so there are no hardcoded absolute paths to keep in sync.
  base: '/nexusai/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Off in dev so the SW never sits between `npm run dev` and the API
      // proxy, and never caches a stale shell while iterating.
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Nexus AI',
        short_name: 'Nexus',
        description: 'Expenses, news, AI tutor and cloud, all in one.',
        // Both must stay inside the base or the install prompt is suppressed.
        start_url: '/nexusai/',
        scope: '/nexusai/',
        display: 'standalone',
        background_color: '#000000',
        // Static, unlike the runtime <meta name="theme-color"> that follows the
        // active palette — the installed splash always uses the dark brand.
        theme_color: '#000000',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Shell only. Fonts are JS-imported rather than <link>ed, so woff2 has
        // to be listed explicitly or the app falls back to system fonts offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/nexusai/index.html',
        // The SW must never answer for the API. Expense/news data is owned by
        // the server and persistQueue; a cached API response would surface
        // fabricated offline data and would freeze the 1s Ops stats poll.
        navigateFallbackDenylist: [/^\/nexusai\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        // pdf.worker is ~1.4MB and the default 2MiB cap would silently drop it.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev parity with prod nginx: the client calls /nexusai/api/*.
      '/nexusai/api': {
        target: apiTarget,
        changeOrigin: true,
        ...(targetingRawApi
          ? { rewrite: (p: string) => p.replace(/^\/nexusai/, '') }
          : {}),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
