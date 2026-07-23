# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 响应式 >> 移动端应该适配布局
- Location: e2e/stock-app.spec.ts:127:7

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('.ant-layout-content') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - main [ref=e5]:
    - generic [ref=e9]:
      - generic [ref=e11]:
        - generic [ref=e12]:
          - img "compass" [ref=e13]:
            - img [ref=e14]
          - heading "发掘" [level=3] [ref=e16]
        - text: 板块景气度评分 → 点击板块查看个股详情
      - alert [ref=e17]:
        - img "info-circle" [ref=e18]:
          - img [ref=e19]
        - generic [ref=e21]:
          - generic [ref=e22]: 📋 当前为演示数据
          - generic [ref=e23]: 后端服务不可达，正在显示演示数据供您预览。恢复后端服务后将自动切换至真实数据。
      - generic [ref=e24]:
        - generic [ref=e25]:
          - generic [ref=e26]:
            - generic [ref=e27]: 📊
            - generic [ref=e28]:
              - generic [ref=e29]: 加载中...
              - generic [ref=e30]:
                - generic [ref=e31]: AI 实时解读
                - generic [ref=e32]: 综合0板块 · 多维度分析
          - generic [ref=e33]:
            - generic [ref=e34]:
              - generic [ref=e35]: 个股涨跌
              - generic [ref=e36]:
                - generic [ref=e37]: "3994"
                - generic [ref=e40]: "1139"
              - generic [ref=e41]: 全市场 3994涨1139跌
            - generic [ref=e42]:
              - generic [ref=e43]: 指数均幅
              - generic [ref=e44]: —
        - generic [ref=e45]:
          - generic [ref=e47]: AI正在分析市场数据...
          - generic [ref=e56]:
            - generic [ref=e57]: 📊 关键信号
            - generic [ref=e58]:
              - generic [ref=e59]:
                - generic [ref=e60]: 上涨家数
                - generic [ref=e61]: "3994"
              - generic [ref=e62]:
                - generic [ref=e63]: 下跌家数
                - generic [ref=e64]: "1139"
              - generic [ref=e66]:
                - generic [ref=e67]: 涨停家数
                - generic [ref=e68]: 0 只
              - generic [ref=e69]:
                - generic [ref=e70]: 跌停家数
                - generic [ref=e71]: 0 只
              - generic [ref=e73]:
                - generic [ref=e74]: 市场总成交
                - generic [ref=e75]: 10500.0亿
              - generic [ref=e76]:
                - generic [ref=e77]: 景气 > 70
                - generic [ref=e78]: 0 个
        - generic [ref=e79]:
          - button "filter 立即筛选" [ref=e80] [cursor=pointer]:
            - img "filter" [ref=e82]:
              - img [ref=e83]
            - generic [ref=e85]: 立即筛选
          - button "apartment 产业地图" [ref=e86] [cursor=pointer]:
            - img "apartment" [ref=e88]:
              - img [ref=e89]
            - generic [ref=e91]: 产业地图
          - generic [ref=e92]: 数据实时更新 · 点击板块查看详情
      - generic [ref=e94]:
        - generic [ref=e95]: 板块宽度
        - generic [ref=e96]:
          - generic [ref=e97]: 0 涨
          - generic [ref=e98]: 0 跌
          - generic [ref=e99]: 0%
      - generic [ref=e102]:
        - generic [ref=e103]:
          - strong [ref=e105]: 🏢 板块景气度评分
          - generic [ref=e106]: 综合评分 = 板块热度×50% + 成交活跃×30% + 赚钱效应×20%
        - generic [ref=e107]:
          - generic [ref=e108]:
            - generic [ref=e109] [cursor=pointer]: 行业板块
            - generic [ref=e110] [cursor=pointer]: 概念板块
          - generic [ref=e111]:
            - generic [ref=e112] [cursor=pointer]: 一级
            - generic [ref=e113] [cursor=pointer]: 二级
  - generic "AI助手 — 随时提问" [ref=e114] [cursor=pointer]:
    - img "message" [ref=e115]:
      - img [ref=e116]
  - tablist "主导航" [ref=e118]:
    - tab "洞察" [selected] [ref=e119] [cursor=pointer]:
      - generic [ref=e120]: 🔭
      - generic [ref=e121]: 洞察
    - tab "选股" [ref=e122] [cursor=pointer]:
      - generic [ref=e123]: 🎯
      - generic [ref=e124]: 选股
    - tab "自选" [ref=e125] [cursor=pointer]:
      - generic [ref=e126]: ⭐
      - generic [ref=e127]: 自选
    - tab "产业" [ref=e128] [cursor=pointer]:
      - generic [ref=e129]: 🗺️
      - generic [ref=e130]: 产业
  - button "切换到浅色模式" [ref=e131] [cursor=pointer]: ☀️
  - img "setting" [ref=e133] [cursor=pointer]:
    - img [ref=e134]
```

# Test source

```ts
  30  |     await page.goto('/');
  31  |     const refreshBtn = page.getByRole('button', { name: /刷新/i });
  32  |     if (await refreshBtn.isVisible()) {
  33  |       await refreshBtn.click();
  34  |       // 验证 loading 状态出现后消失
  35  |       await page.waitForTimeout(500);
  36  |     }
  37  |   });
  38  | });
  39  | 
  40  | test.describe('股票搜索', () => {
  41  |   test('应该能搜索股票', async ({ page }) => {
  42  |     await page.goto('/');
  43  |     const searchInput = page.locator('[data-search-input] input, .ant-select input').first();
  44  |     await searchInput.fill('平安');
  45  |     await page.waitForTimeout(500);
  46  |     // 应该出现搜索结果
  47  |     const dropdown = page.locator('.ant-select-dropdown');
  48  |     await expect(dropdown).toBeVisible({ timeout: 5000 });
  49  |   });
  50  | 
  51  |   test('应该支持键盘快捷键聚焦搜索', async ({ page }) => {
  52  |     await page.goto('/');
  53  |     await page.keyboard.press('Control+k');
  54  |     const searchInput = page.locator('[data-search-input] input').first();
  55  |     await expect(searchInput).toBeFocused();
  56  |   });
  57  | });
  58  | 
  59  | test.describe('股票详情页', () => {
  60  |   test('应该展示股票信息', async ({ page }) => {
  61  |     // 修复路由：/stock/ → /stocks/
  62  |     await page.goto('/stocks/000001.SZ');
  63  |     // 等待页面加载
  64  |     await page.waitForSelector('.ant-tabs, .ant-empty, .ant-spin', { timeout: 10000 });
  65  |     // 如果有数据，应该展示 Tab
  66  |     const tabs = page.locator('.ant-tabs-tab');
  67  |     const tabCount = await tabs.count();
  68  |     if (tabCount > 0) {
  69  |       await expect(tabs.first()).toBeVisible();
  70  |     }
  71  |   });
  72  | });
  73  | 
  74  | test.describe('自选股', () => {
  75  |   test('应该能访问自选股页面', async ({ page }) => {
  76  |     await page.goto('/watchlist');
  77  |     await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
  78  |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  79  |   });
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
> 130 |     await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
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