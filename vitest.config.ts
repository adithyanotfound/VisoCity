import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@visoagent/protocol': path.resolve(__dirname, 'packages/protocol/src/index.ts'),
      '@visoagent/worldgen': path.resolve(__dirname, 'packages/worldgen/src/index.ts'),
      '@visoagent/layout': path.resolve(__dirname, 'packages/layout/src/index.ts'),
      '@visoagent/storage': path.resolve(__dirname, 'packages/storage/src/index.ts'),
      '@visoagent/git': path.resolve(__dirname, 'packages/git/src/index.ts'),
      '@visoagent/agent': path.resolve(__dirname, 'packages/agent/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'apps/**/*.{test,spec}.{ts,tsx}',
    ],
  },
});
