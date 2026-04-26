import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
    // 测试超时设置
    testTimeout: 10000,
    hookTimeout: 10000,
    // 优化测试性能
    threads: true,
    maxWorkers: 4,
    minWorkers: 2,
    isolate: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
