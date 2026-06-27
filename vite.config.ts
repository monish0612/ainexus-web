import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// During local dev we proxy /api to the backend so the browser stays same-origin
// (mirrors the nginx reverse-proxy used in production). Override the target with
// VITE_DEV_API_TARGET when running against a different backend.
const apiTarget = process.env.VITE_DEV_API_TARGET || 'http://72.60.219.97:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
