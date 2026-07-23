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
          - link "⭐ 自选组合 ▶" [ref=e19] [cursor=pointer]:
            - /url: /watchlist
            - generic [ref=e20]: ⭐
            - generic [ref=e21]: 自选组合
            - generic [ref=e22]: ▶
        - listitem [ref=e23]:
          - link "🗺️ 产业地图" [ref=e24] [cursor=pointer]:
            - /url: /industry-map
            - generic [ref=e25]: 🗺️
            - generic [ref=e26]: 产业地图
        - listitem [ref=e27]:
          - link "🏆 潜力雷达" [ref=e28] [cursor=pointer]:
            - /url: /radar
            - generic [ref=e29]: 🏆
            - generic [ref=e30]: 潜力雷达
        - listitem [ref=e31]:
          - link "📝 投资笔记" [ref=e32] [cursor=pointer]:
            - /url: /knowledge
            - generic [ref=e33]: 📝
            - generic [ref=e34]: 投资笔记
      - generic [ref=e35]:
        - generic [ref=e38]: 服务正常
        - generic [ref=e39]: v1.0.0
  - main [ref=e40]:
    - generic [ref=e43]:
      - generic [ref=e45]:
        - generic [ref=e46]: 📊
        - generic [ref=e48]:
          - strong [ref=e50]: 自选组合 · 追踪中心
          - text: 暂无自选股，请先添加
      - generic [ref=e51]:
        - generic [ref=e52]:
          - tablist [ref=e53]:
            - generic [ref=e55]:
              - tab "star 自选追踪" [selected] [ref=e57] [cursor=pointer]:
                - generic [ref=e58]:
                  - img "star" [ref=e60]:
                    - img [ref=e61]
                  - generic [ref=e63]: 自选追踪
              - tab "robot AI复盘" [ref=e65] [cursor=pointer]:
                - generic [ref=e66]:
                  - img "robot" [ref=e68]:
                    - img [ref=e69]
                  - generic [ref=e71]: AI复盘
          - generic:
            - generic:
              - tabpanel "star 自选追踪"
        - generic [ref=e74]:
          - generic [ref=e76]:
            - generic [ref=e78]:
              - generic [ref=e79]: 📊
              - heading "追踪中心" [level=3] [ref=e81]
              - generic [ref=e83]: 01:43:51 更新
            - button "reload 刷新" [ref=e87] [cursor=pointer]:
              - img "reload" [ref=e89]:
                - img [ref=e90]
              - generic [ref=e92]: 刷新
          - generic [ref=e93]:
            - generic [ref=e97]:
              - generic [ref=e98]: 追踪总数
              - generic [ref=e99]:
                - img "star" [ref=e101]:
                  - img [ref=e102]
                - generic [ref=e104]: "0"
                - generic [ref=e105]: 只
            - generic [ref=e109]:
              - generic [ref=e110]: 今日平均涨跌
              - generic [ref=e111]:
                - img "arrow-up" [ref=e113]:
                  - img [ref=e114]
                - generic [ref=e116]: "0.00"
                - generic [ref=e117]: "%"
            - generic [ref=e121]:
              - generic [ref=e122]: 异动提醒
              - generic [ref=e123]:
                - img "bell" [ref=e125]:
                  - img [ref=e126]
                - generic [ref=e128]: "0"
                - generic [ref=e129]: 条
          - generic [ref=e131]:
            - generic [ref=e132]:
              - generic [ref=e133] [cursor=pointer]:
                - img "folder" [ref=e134]:
                  - img [ref=e135]
                - generic [ref=e137]: 默认分组
                - button "plus" [ref=e138]:
                  - img "plus" [ref=e140]:
                    - img [ref=e141]
              - button "plus 新分组" [ref=e144] [cursor=pointer]:
                - img "plus" [ref=e146]:
                  - img [ref=e147]
                - generic [ref=e150]: 新分组
              - button "plus 添加股票" [ref=e151] [cursor=pointer]:
                - img "plus" [ref=e153]:
                  - img [ref=e154]
                - generic [ref=e157]: 添加股票
            - generic [ref=e158]:
              - img "thunderbolt" [ref=e160]:
                - img [ref=e161]
              - generic [ref=e164]:
                - generic [ref=e165]: 追踪列表为空
                - text: 点击「添加股票」开始追踪您关注的 A 股
              - button "plus 添加第一只股票" [ref=e167] [cursor=pointer]:
                - img "plus" [ref=e169]:
                  - img [ref=e170]
                - generic [ref=e173]: 添加第一只股票
          - generic [ref=e176]:
            - img "robot" [ref=e177]:
              - img [ref=e178]
            - generic [ref=e180]:
              - strong [ref=e182]: AI 追踪总结
              - text: 添加股票到追踪列表后，AI 将为您生成个性化追踪总结，包括板块分析、资金流向、技术面信号等。
            - img "info-circle" [ref=e183]:
              - img [ref=e184]
          - generic [ref=e189]:
            - img "robot" [ref=e190]:
              - img [ref=e191]
            - generic [ref=e194]:
              - strong [ref=e196]: 🎯 AI 推荐发现
              - button "获取推荐" [disabled] [ref=e197]:
                - generic: 获取推荐
  - generic "AI助手 — 随时提问" [ref=e198] [cursor=pointer]:
    - img "message" [ref=e199]:
      - img [ref=e200]
  - button "切换到浅色模式" [ref=e202] [cursor=pointer]: ☀️
  - img "setting" [ref=e204] [cursor=pointer]:
    - img [ref=e205]
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