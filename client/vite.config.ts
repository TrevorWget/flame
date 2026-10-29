import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Flame server that the dev server proxies API, upload and WebSocket requests to
const serverUrl = process.env.FLAME_SERVER_URL || 'http://localhost:5005';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': serverUrl,
      '/uploads': serverUrl,
      '/socket': { target: serverUrl, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
});
