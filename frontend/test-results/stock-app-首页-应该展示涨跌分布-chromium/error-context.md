# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 首页 >> 应该展示涨跌分布
- Location: e2e/stock-app.spec.ts:21:7

# Error details

```
Error: locator._expect: expectedNumber: expected float, got object
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
          - link "🔭 市场洞察 ▶" [ref=e11] [cursor=pointer]:
            - /url: /
            - generic [ref=e12]: 🔭
            - generic [ref=e13]: 市场洞察
            - generic [ref=e14]: ▶
        - listitem [ref=e15]:
          - link "🎯 策略选股" [ref=e16] [cursor=pointer]:
            - /url: /screener
            - generic [ref=e17]: 🎯
            - generic [ref=e18]: 策略选股
        - listitem [ref=e19]:
          - link "⭐ 自选组合" [ref=e20] [cursor=pointer]:
            - /url: /watchlist
            - generic [ref=e21]: ⭐
            - generic [ref=e22]: 自选组合
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
    - generic [ref=e42]:
      - generic [ref=e48]:
        - generic [ref=e53]:
          - heading [level=3] [ref=e54]
          - list [ref=e55]:
            - listitem [ref=e56]
        - generic [ref=e61]:
          - heading [level=3] [ref=e62]
          - list [ref=e63]:
            - listitem [ref=e64]
        - generic [ref=e69]:
          - heading [level=3] [ref=e70]
          - list [ref=e71]:
            - listitem [ref=e72]
        - generic [ref=e77]:
          - heading [level=3] [ref=e78]
          - list [ref=e79]:
            - listitem [ref=e80]
      - generic [ref=e81]:
        - generic [ref=e86]:
          - heading [level=3] [ref=e87]
          - list [ref=e88]:
            - listitem [ref=e89]
            - listitem [ref=e90]
            - listitem [ref=e91]
            - listitem [ref=e92]
            - listitem [ref=e93]
            - listitem [ref=e94]
            - listitem [ref=e95]
            - listitem [ref=e96]
        - generic [ref=e101]:
          - heading [level=3] [ref=e102]
          - list [ref=e103]:
            - listitem [ref=e104]
            - listitem [ref=e105]
            - listitem [ref=e106]
            - listitem [ref=e107]
            - listitem [ref=e108]
            - listitem [ref=e109]
            - listitem [ref=e110]
            - listitem [ref=e111]
  - generic "AI助手 — 随时提问" [ref=e112] [cursor=pointer]:
    - img "message" [ref=e113]:
      - img [ref=e114]
  - button "切换到浅色模式" [ref=e116] [cursor=pointer]: ☀️
  - img "setting" [ref=e118] [cursor=pointer]:
    - img [ref=e119]
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
> 26  |     await expect(cards).toHaveCount(expect.any(Number));
      |                         ^ Error: locator._expect: expectedNumber: expected float, got object
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
```