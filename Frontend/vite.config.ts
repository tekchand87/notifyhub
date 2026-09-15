import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  server: {
    port: 5173,
    // Only /api/* and /health* are proxied to Express (port 3000).
    // All other routes (e.g. /api-keys, /dashboard) are served by Vite,
    // which returns index.html so React Router handles them client-side.
    // IMPORTANT: access the app at http://localhost:5173, NOT :3000
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});

