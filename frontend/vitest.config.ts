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
    // 与 vite.config.ts 的 resolve.extensions 对齐（R0' CI 收口修复）：
    // 不设置时 vitest 走 vite 默认顺序（.js 先于 .ts），shared/ 下陈旧编译产物
    // （如 4 月残留的 types.js 空壳）会影子化 types.ts，导致 CACHE_TTL 等运行时
    // 导出为 undefined、api.ts 模块初始化即崩（CI StockTable.test.tsx 首跑失败根因）。
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: {
      // 修正层级：本文件位于 frontend/ 下，'../shared' 才指向仓库根 shared/
      // （原 '../../shared' 指到仓库外层，路径不存在）。
      '@shared': path.resolve(__dirname, '../shared'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
