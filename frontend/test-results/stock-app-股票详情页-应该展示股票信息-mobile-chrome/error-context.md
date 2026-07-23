# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 股票详情页 >> 应该展示股票信息
- Location: e2e/stock-app.spec.ts:60:7

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.ant-tabs, .ant-empty, .ant-spin') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - main [ref=e5]:
    - generic [ref=e8]:
      - navigation [ref=e9]:
        - list [ref=e10]:
          - listitem [ref=e11]:
            - link "compass 发掘" [ref=e12] [cursor=pointer]:
              - /url: /discover
              - img "compass" [ref=e13]:
                - img [ref=e14]
              - text: 发掘
          - listitem [ref=e16]: /
          - listitem [ref=e17]:
            - link "stock 股票" [ref=e18] [cursor=pointer]:
              - /url: /stocks
              - img "stock" [ref=e19]:
                - img [ref=e20]
              - text: 股票
          - listitem [ref=e22]: /
          - listitem [ref=e23]: "000001"
      - generic [ref=e25]:
        - generic [ref=e28]:
          - generic [ref=e32]:
            - heading "000001" [level=4] [ref=e34]
            - generic [ref=e36]: "000001"
            - button "star" [ref=e38] [cursor=pointer]:
              - img "star" [ref=e40]:
                - img [ref=e41]
          - generic [ref=e43]: 暂无行情数据
          - generic [ref=e45]:
            - button "reload 刷新" [ref=e47] [cursor=pointer]:
              - img "reload" [ref=e49]:
                - img [ref=e50]
              - generic [ref=e52]: 刷新
            - button "fund-projection-screen 📊 回测" [ref=e54] [cursor=pointer]:
              - img "fund-projection-screen" [ref=e56]:
                - img [ref=e57]
              - generic [ref=e60]: 📊 回测
            - button "line-chart 返回列表" [ref=e62] [cursor=pointer]:
              - img "line-chart" [ref=e64]:
                - img [ref=e65]
              - generic [ref=e67]: 返回列表
        - generic [ref=e68]:
          - generic [ref=e72]:
            - generic [ref=e73]: K线图
            - radiogroup "segmented control" [ref=e75]:
              - generic [ref=e76]:
                - generic [ref=e77] [cursor=pointer]:
                  - radio "日K" [checked]
                  - generic "日K" [ref=e78]
                - generic [ref=e79] [cursor=pointer]:
                  - radio "周K"
                  - generic "周K" [ref=e80]
                - generic [ref=e81] [cursor=pointer]:
                  - radio "月K"
                  - generic "月K" [ref=e82]
            - button "fullscreen" [ref=e84] [cursor=pointer]:
              - img "fullscreen" [ref=e86]:
                - img [ref=e87]
          - generic [ref=e91]:
            - img "bar-chart" [ref=e93]:
              - img [ref=e94]
            - heading "暂无K线数据" [level=5] [ref=e96]
            - generic [ref=e97]: 该股票暂无K线行情数据
            - button "数据同步" [ref=e100] [cursor=pointer]:
              - generic [ref=e101]: 数据同步
        - generic [ref=e104]: "信号加载失败: Failed to fetch signals"
        - generic [ref=e105]:
          - generic [ref=e109]:
            - generic [ref=e110]: 🔬 AI 深度诊断
            - button "开始诊断" [ref=e111] [cursor=pointer]:
              - generic [ref=e112]: 开始诊断
          - generic [ref=e114]:
            - generic [ref=e115]: 🤖
            - generic [ref=e116]: 点击"开始诊断"，AI 将从估值、技术面、基本面三个维度进行综合分析
  - generic "AI助手 — 随时提问" [ref=e117] [cursor=pointer]:
    - img "message" [ref=e118]:
      - img [ref=e119]
  - tablist "主导航" [ref=e121]:
    - tab "洞察" [ref=e122] [cursor=pointer]:
      - generic [ref=e123]: 🔭
      - generic [ref=e124]: 洞察
    - tab "选股" [ref=e125] [cursor=pointer]:
      - generic [ref=e126]: 🎯
      - generic [ref=e127]: 选股
    - tab "自选" [ref=e128] [cursor=pointer]:
      - generic [ref=e129]: ⭐
      - generic [ref=e130]: 自选
    - tab "产业" [ref=e131] [cursor=pointer]:
      - generic [ref=e132]: 🗺️
      - generic [ref=e133]: 产业
  - button "切换到浅色模式" [ref=e134] [cursor=pointer]: ☀️
  - img "setting" [ref=e136] [cursor=pointer]:
    - img [ref=e137]
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
> 64  |     await page.waitForSelector('.ant-tabs, .ant-empty, .ant-spin', { timeout: 10000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
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
```