import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@visoagent/protocol': path.resolve(__dirname, '../../packages/protocol/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/health': {
        target: 'http://127.0.0.1:4100',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:4100',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:4100',
        ws: true,
      },
    },
  },
});
