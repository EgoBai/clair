import { defineConfig } from 'vitest/config'

// 小程序 POC 逻辑层测试配置。
// 测试文件放在 tests/（在 src 之外），不会进入 Taro 的 weapp/h5 生产构建。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 沙箱 OOM 规避：定向运行单文件 + forks 池 + 限制旧空间
    pool: 'forks',
    globals: false,
  },
})
