import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/__tests__/setup.ts'],
    // 优化测试性能
    threads: true, // 启用多线程
    maxWorkers: 4, // 最大工作线程数（根据CPU核心数调整）
    minWorkers: 2, // 最小工作线程数
    isolate: true, // 隔离测试环境
    // 测试超时设置
    testTimeout: 10000, // 10秒超时
    hookTimeout: 10000, // hook超时
    // Pool配置: 修复worker启动flaky timeout
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
      ],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../../shared'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
