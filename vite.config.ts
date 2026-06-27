import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// During local dev we proxy /api to the backend so the browser stays same-origin
// (mirrors the nginx reverse-proxy used in production). Override the target with
// VITE_DEV_API_TARGET when running against a different backend.
const apiTarget = process.env.VITE_DEV_API_TARGET || 'http://72.60.219.97:3000';

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
      // Dev parity with prod nginx: the client calls /nexusai/api/* and we
      // strip the /nexusai prefix before forwarding to the backend (/api/*).
      '/nexusai/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/nexusai/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
