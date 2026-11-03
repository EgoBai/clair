import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  // baseURL 与下方 webServer.url 必须指向同一个实例。
  // 刻意用 127.0.0.1 而非 localhost：vite.config.ts 的 server.host 是 '127.0.0.1'，
  // 而 CI（ubuntu）上 localhost 可能先解析到 ::1，造成 webServer 健康检查连不上（假超时）。
  // 本地若有 dev server 在跑，reuseExistingServer 会直接复用；CI 里由 webServer 新起一个。
  // 后端（127.0.0.1:3001）不在这里拉起：e2e 的诚实空态用例用 context.route 接管取数，
  // 路由/渲染冒烟不依赖后端真实数据；本地跑时由 vite proxy 转发给已在跑的后端。
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    // 30s 在 CI 冷启动（npm run dev 首次预构建依赖）下偏紧，放宽到 120s。
    timeout: 120000,
  },
});
