import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { queryClient } from './lib/query';
import { installGlobalErrorLogging } from './lib/logger';
import { ErrorBoundary } from './components/ErrorBoundary';
// Self-hosted fonts (bundled, served from our own origin) — keeps the UI
// intact even if the office network blocks external font CDNs.
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import './index.css';

installGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* Honours prefers-reduced-motion for every motion component: framer
            drops transforms and keeps opacity/colour. CSS keyframes and the
            canvas loops are guarded separately (index.css, lib/motion.ts). */}
        <MotionConfig reducedMotion="user">
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <App />
          </BrowserRouter>
        </MotionConfig>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
