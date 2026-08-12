import { defineConfig } from 'vitest/config';
import path from 'node:path';

const aliases = {
  '@visoagent/protocol': path.resolve(__dirname, 'packages/protocol/src/index.ts'),
  '@visoagent/worldgen': path.resolve(__dirname, 'packages/worldgen/src/index.ts'),
  '@visoagent/layout': path.resolve(__dirname, 'packages/layout/src/index.ts'),
  '@visoagent/storage': path.resolve(__dirname, 'packages/storage/src/index.ts'),
  '@visoagent/git': path.resolve(__dirname, 'packages/git/src/index.ts'),
  '@visoagent/agent': path.resolve(__dirname, 'packages/agent/src/index.ts'),
};

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['packages/**/src/**', 'apps/**/src/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/dist/**',
        '**/node_modules/**',
        '**/main.tsx',
      ],
    },
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: 'unit',
          environment: 'node',
          globals: true,
          include: ['packages/**/*.{test,spec}.{ts,tsx}', 'apps/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      {
        resolve: { alias: aliases },
        test: {
          name: 'integration',
          environment: 'node',
          globals: true,
          include: ['test/integration/**/*.{test,spec}.{ts,tsx}'],
        },
      },
    ],
  },
});
