# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 投资笔记页 >> 应该能访问投资笔记
- Location: e2e/stock-app.spec.ts:178:7

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.ant-layout-content, .ant-spin, .ant-empty') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - main [ref=e5]:
    - generic [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]:
          - button "arrow-left" [ref=e12] [cursor=pointer]:
            - img "arrow-left" [ref=e14]:
              - img [ref=e15]
          - img "book" [ref=e17]:
            - img [ref=e18]
          - heading "投资笔记" [level=3] [ref=e20]
        - button "plus 写笔记" [ref=e21] [cursor=pointer]:
          - img "plus" [ref=e23]:
            - img [ref=e24]
          - generic [ref=e27]: 写笔记
      - alert [ref=e28]:
        - img "info-circle" [ref=e29]:
          - img [ref=e30]
        - generic [ref=e32]:
          - generic [ref=e33]: 📋 当前为演示数据
          - generic [ref=e34]: 您还没有投资笔记，以下为演示内容供您预览。在 AI 对话中保存笔记或手动添加后，演示数据将自动隐藏。
      - generic [ref=e35]:
        - generic [ref=e37]:
          - img "file-text" [ref=e39]:
            - img [ref=e40]
          - generic [ref=e42]:
            - generic [ref=e43]: 笔记总数
            - generic [ref=e45]: "3"
        - generic [ref=e47]:
          - img "calendar" [ref=e49]:
            - img [ref=e50]
          - generic [ref=e52]:
            - generic [ref=e53]: 本周新增
            - generic [ref=e54]:
              - generic [ref=e55]: "0"
              - img "rise" [ref=e56]:
                - img [ref=e57]
        - generic [ref=e60]:
          - img "fire" [ref=e62]:
            - img [ref=e63]
          - generic [ref=e65]:
            - generic [ref=e66]: 最常关注
            - generic [ref=e68]: 📝 学习笔记
      - generic [ref=e69]:
        - generic [ref=e70] [cursor=pointer]: 全部 (3)
        - generic [ref=e71] [cursor=pointer]: 🏭 产业知识 (0)
        - generic [ref=e72] [cursor=pointer]: 📚 投资方法 (0)
        - generic [ref=e73] [cursor=pointer]: 💡 关注概念 (0)
        - generic [ref=e74] [cursor=pointer]: 📝 学习笔记 (0)
      - generic [ref=e75]:
        - img "search" [ref=e77]:
          - img [ref=e78]
        - textbox "搜索笔记标题、内容或标签..." [ref=e80]
      - generic [ref=e82]:
        - generic [ref=e84] [cursor=pointer]:
          - generic [ref=e85]:
            - strong [ref=e88]: 宁德时代 2025Q3 业绩跟踪
            - generic [ref=e89]:
              - generic [ref=e91]: 📝 学习笔记
              - button "delete" [ref=e93]:
                - img "delete" [ref=e95]:
                  - img [ref=e96]
          - generic [ref=e99]: 动力电池出货量同比增长 35%，储能业务爆发式增长。毛利率环比改善 2.3pct，主要受益于碳酸锂价格下行。海外市场拓展顺利，欧洲工厂产能爬坡中。
          - generic [ref=e100]:
            - img "calendar" [ref=e101]:
              - img [ref=e102]
            - generic [ref=e104]: 2025年7月15日 18:30
            - generic [ref=e105]: 300750.SZ
            - generic [ref=e106]:
              - img "message" [ref=e107]:
                - img [ref=e108]
              - text: AI 对话
            - generic [ref=e110]:
              - generic [ref=e111]: 业绩跟踪
              - generic [ref=e112]: 新能源
              - generic [ref=e113]: 电池
        - generic [ref=e115] [cursor=pointer]:
          - generic [ref=e116]:
            - strong [ref=e119]: 白酒行业渠道库存调研
            - generic [ref=e120]:
              - generic [ref=e122]: 📝 学习笔记
              - button "delete" [ref=e124]:
                - img "delete" [ref=e126]:
                  - img [ref=e127]
          - generic [ref=e130]: 茅台批价稳定在 1680-1700 元区间，五粮液批价 950-965 元。渠道库存整体健康，经销商打款积极性回升。中秋旺季备货已启动，关注动销数据。
          - generic [ref=e131]:
            - img "calendar" [ref=e132]:
              - img [ref=e133]
            - generic [ref=e135]: 2025年7月10日 23:20
            - generic [ref=e136]: 600519.SH
            - generic [ref=e137]:
              - img "message" [ref=e138]:
                - img [ref=e139]
              - text: AI 对话
            - generic [ref=e141]:
              - generic [ref=e142]: 行业调研
              - generic [ref=e143]: 白酒
              - generic [ref=e144]: 消费
        - generic [ref=e146] [cursor=pointer]:
          - generic [ref=e147]:
            - strong [ref=e150]: 招商银行 2025 半年报点评
            - generic [ref=e151]:
              - generic [ref=e153]: 📝 学习笔记
              - button "delete" [ref=e155]:
                - img "delete" [ref=e157]:
                  - img [ref=e158]
          - generic [ref=e161]: 营收增速转正，净息差企稳。不良率 0.95%，环比下降 2bp。零售客户数突破 2 亿，AUM 同比增长 12%。财富管理中收占比提升至 35%。
          - generic [ref=e162]:
            - img "calendar" [ref=e163]:
              - img [ref=e164]
            - generic [ref=e166]: 2025年7月5日 22:00
            - generic [ref=e167]: 600036.SH
            - generic [ref=e168]:
              - img "message" [ref=e169]:
                - img [ref=e170]
              - text: AI 对话
            - generic [ref=e172]:
              - generic [ref=e173]: 财报点评
              - generic [ref=e174]: 银行
              - generic [ref=e175]: 零售
        - generic [ref=e176]:
          - text: ✨ 在
          - strong [ref=e177]: AI 对话
          - text: 中与大模型交流时， 随时点击
          - generic [ref=e178]: 📝 保存到投资笔记
          - text: 来积累你的投资知识
  - generic "AI助手 — 随时提问" [ref=e179] [cursor=pointer]:
    - img "message" [ref=e180]:
      - img [ref=e181]
  - tablist "主导航" [ref=e183]:
    - tab "洞察" [ref=e184] [cursor=pointer]:
      - generic [ref=e185]: 🔭
      - generic [ref=e186]: 洞察
    - tab "选股" [ref=e187] [cursor=pointer]:
      - generic [ref=e188]: 🎯
      - generic [ref=e189]: 选股
    - tab "自选" [ref=e190] [cursor=pointer]:
      - generic [ref=e191]: ⭐
      - generic [ref=e192]: 自选
    - tab "产业" [ref=e193] [cursor=pointer]:
      - generic [ref=e194]: 🗺️
      - generic [ref=e195]: 产业
  - button "切换到浅色模式" [ref=e196] [cursor=pointer]: ☀️
  - img "setting" [ref=e198] [cursor=pointer]:
    - img [ref=e199]
```

# Test source

```ts
  80  | });
  81  | 
  82  | test.describe('选股器', () => {
  83  |   test('应该能打开选股器', async ({ page }) => {
  84  |     await page.goto('/screener');
  85  |     await page.waitForSelector('.ant-card', { timeout: 10000 });
  86  |     await expect(page.getByText('筛选条件')).toBeVisible();
  87  |   });
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
> 180 |     await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  181 |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  182 |   });
  183 | });
  184 | 
  185 | test.describe('404 页面', () => {
  186 |   test('未知路由应显示 404', async ({ page }) => {
  187 |     await page.goto('/this-route-does-not-exist-12345');
  188 |     await page.waitForSelector('.ant-layout-content, .ant-result', { timeout: 10000 });
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