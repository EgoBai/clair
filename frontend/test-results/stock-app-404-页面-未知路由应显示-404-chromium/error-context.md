# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 404 页面 >> 未知路由应显示 404
- Location: e2e/stock-app.spec.ts:186:7

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.ant-layout-content, .ant-result') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - navigation:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "澄观" [level=2] [ref=e7]
        - generic [ref=e8]: Clair · 水静则明
      - list [ref=e9]:
        - listitem [ref=e10]:
          - link "🔭 市场洞察" [ref=e11] [cursor=pointer]:
            - /url: /
            - generic [ref=e12]: 🔭
            - generic [ref=e13]: 市场洞察
        - listitem [ref=e14]:
          - link "🎯 策略选股" [ref=e15] [cursor=pointer]:
            - /url: /screener
            - generic [ref=e16]: 🎯
            - generic [ref=e17]: 策略选股
        - listitem [ref=e18]:
          - link "⭐ 自选组合" [ref=e19] [cursor=pointer]:
            - /url: /watchlist
            - generic [ref=e20]: ⭐
            - generic [ref=e21]: 自选组合
        - listitem [ref=e22]:
          - link "🗺️ 产业地图" [ref=e23] [cursor=pointer]:
            - /url: /industry-map
            - generic [ref=e24]: 🗺️
            - generic [ref=e25]: 产业地图
        - listitem [ref=e26]:
          - link "🏆 潜力雷达" [ref=e27] [cursor=pointer]:
            - /url: /radar
            - generic [ref=e28]: 🏆
            - generic [ref=e29]: 潜力雷达
        - listitem [ref=e30]:
          - link "📝 投资笔记" [ref=e31] [cursor=pointer]:
            - /url: /knowledge
            - generic [ref=e32]: 📝
            - generic [ref=e33]: 投资笔记
      - generic [ref=e34]:
        - generic [ref=e37]: 服务正常
        - generic [ref=e38]: v1.0.0
  - main [ref=e39]:
    - generic [ref=e43]:
      - generic [ref=e44]: "404"
      - generic [ref=e45]: 🔍
      - heading "页面未找到" [level=1] [ref=e46]
      - paragraph [ref=e47]: 抱歉，您访问的页面不存在或已被移动。
      - generic [ref=e48]:
        - button "← 返回上一页" [ref=e49] [cursor=pointer]
        - link "🏠 返回首页" [ref=e50] [cursor=pointer]:
          - /url: /
        - button "🔄 刷新页面" [ref=e51] [cursor=pointer]
      - generic [ref=e52]:
        - heading "📋 快速导航" [level=3] [ref=e53]
        - generic [ref=e54]:
          - link "📈 股票列表 查看所有股票行情" [ref=e55] [cursor=pointer]:
            - /url: /stocks
            - generic [ref=e56]: 📈
            - generic [ref=e57]:
              - heading "股票列表" [level=4] [ref=e58]
              - paragraph [ref=e59]: 查看所有股票行情
          - link "📊 股票筛选 按条件筛选股票" [ref=e60] [cursor=pointer]:
            - /url: /screener
            - generic [ref=e61]: 📊
            - generic [ref=e62]:
              - heading "股票筛选" [level=4] [ref=e63]
              - paragraph [ref=e64]: 按条件筛选股票
          - link "⭐ 自选股 管理关注的股票" [ref=e65] [cursor=pointer]:
            - /url: /watchlist
            - generic [ref=e66]: ⭐
            - generic [ref=e67]:
              - heading "自选股" [level=4] [ref=e68]
              - paragraph [ref=e69]: 管理关注的股票
          - link "🔍 股票筛选 按条件筛选股票" [ref=e70] [cursor=pointer]:
            - /url: /screener
            - generic [ref=e71]: 🔍
            - generic [ref=e72]:
              - heading "股票筛选" [level=4] [ref=e73]
              - paragraph [ref=e74]: 按条件筛选股票
      - generic [ref=e75]:
        - heading "💡 需要帮助？" [level=3] [ref=e76]
        - generic [ref=e77]:
          - generic [ref=e78]:
            - generic [ref=e79]: 📧
            - generic [ref=e80]:
              - heading "联系支持" [level=4] [ref=e81]
              - paragraph [ref=e82]: 发送邮件至 support@astock.com
          - generic [ref=e83]:
            - generic [ref=e84]: 📚
            - generic [ref=e85]:
              - heading "查看文档" [level=4] [ref=e86]
              - paragraph [ref=e87]: 访问帮助中心获取更多信息
          - generic [ref=e88]:
            - generic [ref=e89]: 🐛
            - generic [ref=e90]:
              - heading "报告问题" [level=4] [ref=e91]
              - paragraph [ref=e92]: 反馈您遇到的问题
  - generic "AI助手 — 随时提问" [ref=e93] [cursor=pointer]:
    - img "message" [ref=e94]:
      - img [ref=e95]
  - button "切换到浅色模式" [ref=e97] [cursor=pointer]: ☀️
  - img "setting" [ref=e99] [cursor=pointer]:
    - img [ref=e100]
```

# Test source

```ts
  88  | 
  89  |   test('应该能执行筛选', async ({ page }) => {
  90  |     await page.goto('/screener');
  91  |     await page.waitForSelector('.ant-card', { timeout: 10000 });
  92  |     const executeBtn = page.getByRole('button', { name: /执行/i });
  93  |     if (await executeBtn.isVisible()) {
  94  |       await executeBtn.click();
  95  |       // 等待结果或空状态
  96  |       await page.waitForTimeout(2000);
  97  |     }
  98  |   });
  99  | 
  100 |   test('应该能添加筛选条件', async ({ page }) => {
  101 |     await page.goto('/screener');
  102 |     await page.waitForSelector('.ant-card', { timeout: 10000 });
  103 |     const addBtn = page.getByRole('button', { name: /添加/i }).first();
  104 |     if (await addBtn.isVisible()) {
  105 |       await addBtn.click();
  106 |       await page.waitForTimeout(500);
  107 |     }
  108 |   });
  109 | });
  110 | 
  111 | test.describe('暗色主题', () => {
  112 |   test('应该能切换主题', async ({ page }) => {
  113 |     await page.goto('/');
  114 |     const themeBtn = page.locator('[class*="theme"], button:has(svg)').filter({ hasText: /主题|theme/i }).first();
  115 |     if (await themeBtn.isVisible()) {
  116 |       await themeBtn.click();
  117 |       const darkOption = page.getByText(/深色|Dark/i);
  118 |       if (await darkOption.isVisible()) {
  119 |         await darkOption.click();
  120 |         await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  121 |       }
  122 |     }
  123 |   });
  124 | });
  125 | 
  126 | test.describe('响应式', () => {
  127 |   test('移动端应该适配布局', async ({ page }) => {
  128 |     await page.setViewportSize({ width: 375, height: 812 });
  129 |     await page.goto('/');
  130 |     await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
  131 |     // 验证侧边栏在移动端隐藏
  132 |     const sidebar = page.locator('.ant-layout-sider');
  133 |     const sidebarVisible = await sidebar.isVisible();
  134 |     // 移动端侧边栏应该被隐藏或折叠
  135 |     // 具体行为取决于实现
  136 |   });
  137 | });
  138 | 
  139 | // ==================== 新增：核心链路覆盖 ====================
  140 | 
  141 | test.describe('路由重定向', () => {
  142 |   test('/market 应重定向到首页', async ({ page }) => {
  143 |     await page.goto('/market');
  144 |     await page.waitForURL('**/');
  145 |     expect(page.url()).toMatch(/\/$/);
  146 |   });
  147 | 
  148 |   test('/review 应重定向到 /watchlist?tab=review', async ({ page }) => {
  149 |     await page.goto('/review');
  150 |     await page.waitForURL(/\/watchlist\?tab=review/);
  151 |     expect(page.url()).toContain('tab=review');
  152 |   });
  153 | 
  154 |   test('/home 应重定向到首页', async ({ page }) => {
  155 |     await page.goto('/home');
  156 |     await page.waitForURL('**/');
  157 |     expect(page.url()).toMatch(/\/$/);
  158 |   });
  159 | });
  160 | 
  161 | test.describe('产业地图页', () => {
  162 |   test('应该能访问产业地图', async ({ page }) => {
  163 |     await page.goto('/industry-map');
  164 |     await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
  165 |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  166 |   });
  167 | });
  168 | 
  169 | test.describe('潜力雷达页', () => {
  170 |   test('应该能访问潜力雷达', async ({ page }) => {
  171 |     await page.goto('/radar');
  172 |     await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
  173 |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  174 |   });
  175 | });
  176 | 
  177 | test.describe('投资笔记页', () => {
  178 |   test('应该能访问投资笔记', async ({ page }) => {
  179 |     await page.goto('/knowledge');
  180 |     await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
  181 |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  182 |   });
  183 | });
  184 | 
  185 | test.describe('404 页面', () => {
  186 |   test('未知路由应显示 404', async ({ page }) => {
  187 |     await page.goto('/this-route-does-not-exist-12345');
> 188 |     await page.waitForSelector('.ant-layout-content, .ant-result', { timeout: 10000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  189 |     // 404 页面应该可见（可能是 ant-result 或自定义内容）
  190 |     const content = page.locator('.ant-layout-content');
  191 |     await expect(content).toBeVisible();
  192 |   });
  193 | });
  194 | 
  195 | test.describe('自选组合 Hub', () => {
  196 |   test('应该能在追踪和复盘 Tab 间切换', async ({ page }) => {
  197 |     await page.goto('/watchlist');
  198 |     await page.waitForSelector('.ant-tabs', { timeout: 10000 });
  199 |     // 点击 AI复盘 Tab
  200 |     const reviewTab = page.getByText('AI复盘').first();
  201 |     if (await reviewTab.isVisible()) {
  202 |       await reviewTab.click();
  203 |       await page.waitForTimeout(500);
  204 |     }
  205 |     // 切换回自选追踪
  206 |     const trackingTab = page.getByText('自选追踪').first();
  207 |     if (await trackingTab.isVisible()) {
  208 |       await trackingTab.click();
  209 |       await page.waitForTimeout(500);
  210 |     }
  211 |   });
  212 | });
  213 | 
```