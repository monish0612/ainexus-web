import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
  plugins: [react()],
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
