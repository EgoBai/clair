import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/docs/**'],
    },
  },
  resolve: {
    // backend 测试跨包 import frontend/src/utils 的纯函数时，会带上浏览器端依赖
    // （xlsx / file-saver）。CI 只装 backend 依赖，故用投毒式替身保证可解析但调用即抛错。
    // 起因：run 41758036717 的 dataWarehouse.test.ts "Failed to load url xlsx"。
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      xlsx: path.resolve(__dirname, 'vitest.stubs/xlsx.ts'),
      'file-saver': path.resolve(__dirname, 'vitest.stubs/file-saver.ts'),
    },
  },
});
