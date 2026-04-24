import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: [
      'backend/src/**/*.test.ts',
      'frontend/src/**/*.test.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/e2e/**',
      '**/*.spec.ts',
    ],
    // frontend tests: jsdom for DOM APIs, backend tests: node
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['backend/src/**', 'node'],
    ],
    setupFiles: ['frontend/src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
