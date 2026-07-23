# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 自选股 >> 应该能访问自选股页面
- Location: e2e/stock-app.spec.ts:75:7

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
    - generic [ref=e8]:
      - generic [ref=e10]:
        - generic [ref=e11]: 📊
        - generic [ref=e13]:
          - strong [ref=e15]: 自选组合 · 追踪中心
          - text: 暂无自选股，请先添加
      - generic [ref=e16]:
        - generic [ref=e17]:
          - tablist [ref=e18]:
            - generic [ref=e20]:
              - tab "star 自选追踪" [selected] [ref=e22] [cursor=pointer]:
                - generic [ref=e23]:
                  - img "star" [ref=e25]:
                    - img [ref=e26]
                  - generic [ref=e28]: 自选追踪
              - tab "robot AI复盘" [ref=e30] [cursor=pointer]:
                - generic [ref=e31]:
                  - img "robot" [ref=e33]:
                    - img [ref=e34]
                  - generic [ref=e36]: AI复盘
          - generic:
            - generic:
              - tabpanel "star 自选追踪"
        - generic [ref=e39]:
          - generic [ref=e41]:
            - generic [ref=e43]:
              - generic [ref=e44]: 📊
              - heading "追踪中心" [level=3] [ref=e46]
              - generic [ref=e48]: 01:44:10 更新
            - button "reload 刷新" [ref=e52] [cursor=pointer]:
              - img "reload" [ref=e54]:
                - img [ref=e55]
              - generic [ref=e57]: 刷新
          - generic [ref=e58]:
            - generic [ref=e62]:
              - generic [ref=e63]: 追踪总数
              - generic [ref=e64]:
                - img "star" [ref=e66]:
                  - img [ref=e67]
                - generic [ref=e69]: "0"
                - generic [ref=e70]: 只
            - generic [ref=e74]:
              - generic [ref=e75]: 今日平均涨跌
              - generic [ref=e76]:
                - img "arrow-up" [ref=e78]:
                  - img [ref=e79]
                - generic [ref=e81]: "0.00"
                - generic [ref=e82]: "%"
            - generic [ref=e86]:
              - generic [ref=e87]: 异动提醒
              - generic [ref=e88]:
                - img "bell" [ref=e90]:
                  - img [ref=e91]
                - generic [ref=e93]: "0"
                - generic [ref=e94]: 条
          - generic [ref=e96]:
            - generic [ref=e97]:
              - generic [ref=e98] [cursor=pointer]:
                - img "folder" [ref=e99]:
                  - img [ref=e100]
                - generic [ref=e102]: 默认分组
                - button "plus" [ref=e103]:
                  - img "plus" [ref=e105]:
                    - img [ref=e106]
              - button "plus 新分组" [ref=e109] [cursor=pointer]:
                - img "plus" [ref=e111]:
                  - img [ref=e112]
                - generic [ref=e115]: 新分组
              - button "plus 添加股票" [ref=e116] [cursor=pointer]:
                - img "plus" [ref=e118]:
                  - img [ref=e119]
                - generic [ref=e122]: 添加股票
            - generic [ref=e123]:
              - img "thunderbolt" [ref=e125]:
                - img [ref=e126]
              - generic [ref=e129]:
                - generic [ref=e130]: 追踪列表为空
                - text: 点击「添加股票」开始追踪您关注的 A 股
              - button "plus 添加第一只股票" [ref=e132] [cursor=pointer]:
                - img "plus" [ref=e134]:
                  - img [ref=e135]
                - generic [ref=e138]: 添加第一只股票
          - generic [ref=e141]:
            - img "robot" [ref=e142]:
              - img [ref=e143]
            - generic [ref=e145]:
              - strong [ref=e147]: AI 追踪总结
              - text: 添加股票到追踪列表后，AI 将为您生成个性化追踪总结，包括板块分析、资金流向、技术面信号等。
            - img "info-circle" [ref=e148] [cursor=pointer]:
              - img [ref=e149]
          - generic [ref=e154]:
            - img "robot" [ref=e155]:
              - img [ref=e156]
            - generic [ref=e159]:
              - strong [ref=e161]: 🎯 AI 推荐发现
              - button "获取推荐" [disabled] [ref=e162]:
                - generic: 获取推荐
  - generic "AI助手 — 随时提问" [ref=e163] [cursor=pointer]:
    - img "message" [ref=e164]:
      - img [ref=e165]
  - tablist "主导航" [ref=e167]:
    - tab "洞察" [ref=e168] [cursor=pointer]:
      - generic [ref=e169]: 🔭
      - generic [ref=e170]: 洞察
    - tab "选股" [ref=e171] [cursor=pointer]:
      - generic [ref=e172]: 🎯
      - generic [ref=e173]: 选股
    - tab "自选" [selected] [ref=e174] [cursor=pointer]:
      - generic [ref=e175]: ⭐
      - generic [ref=e176]: 自选
    - tab "产业" [ref=e177] [cursor=pointer]:
      - generic [ref=e178]: 🗺️
      - generic [ref=e179]: 产业
  - button "切换到浅色模式" [ref=e180] [cursor=pointer]: ☀️
  - img "setting" [ref=e182] [cursor=pointer]:
    - img [ref=e183]
```

# Test source

```ts
  1   | /**
  2   |  * E2E 测试 (Playwright)
  3   |  * 
  4   |  * 测试关键用户流程:
  5   |  * - 首页加载与数据展示
  6   |  * - 股票搜索
  7   |  * - 股票详情页
  8   |  * - 自选股管理
  9   |  * - 选股器筛选
  10  |  */
  11  | 
  12  | import { test, expect } from '@playwright/test';
  13  | 
  14  | test.describe('首页', () => {
  15  |   test('应该加载市场概况', async ({ page }) => {
  16  |     await page.goto('/');
  17  |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  18  |     await expect(page.getByText('市场概况')).toBeVisible();
  19  |   });
  20  | 
  21  |   test('应该展示涨跌分布', async ({ page }) => {
  22  |     await page.goto('/');
  23  |     // 等待数据加载
  24  |     await page.waitForSelector('.ant-card', { timeout: 10000 });
  25  |     const cards = page.locator('.ant-card');
  26  |     await expect(cards).toHaveCount(expect.any(Number));
  27  |   });
  28  | 
  29  |   test('应该能刷新数据', async ({ page }) => {
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
> 77  |     await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
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
```