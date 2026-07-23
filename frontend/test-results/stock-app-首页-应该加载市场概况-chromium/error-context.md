# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 首页 >> 应该加载市场概况
- Location: e2e/stock-app.spec.ts:15:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.ant-layout-content')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.ant-layout-content')

```

```yaml
- navigation:
  - heading "澄观" [level=2]
  - text: Clair · 水静则明
  - list:
    - listitem:
      - link "🔭 市场洞察 ▶":
        - /url: /
    - listitem:
      - link "🎯 策略选股":
        - /url: /screener
    - listitem:
      - link "⭐ 自选组合":
        - /url: /watchlist
    - listitem:
      - link "🗺️ 产业地图":
        - /url: /industry-map
    - listitem:
      - link "🏆 潜力雷达":
        - /url: /radar
    - listitem:
      - link "📝 投资笔记":
        - /url: /knowledge
  - text: 服务正常 v1.0.0
- main:
  - img "compass"
  - heading "发掘" [level=3]
  - text: 板块景气度评分 → 点击板块查看个股详情 📊 加载中... AI 实时解读 综合31板块 · 多维度分析 个股涨跌 3994 1139 全市场 3994涨1139跌 指数均幅 — 涨停 150 跌停 8 AI正在分析市场数据... 📊 关键信号 上涨家数 3994 下跌家数 1139 涨停家数 150 只 跌停家数 8 只 市场总成交 21846.9亿 景气 > 70 1 个 🏆 领涨板块 电力设备 +4.0% 环保 +3.2% 有色金属 +3.1% 国防军工 +2.8% 基础化工 +2.6% 📉 弱势板块 电子 0.3% 医药生物 0.7% 银行 0.7%
  - button "filter 立即筛选":
    - img "filter"
    - text: 立即筛选
  - button "apartment 产业地图":
    - img "apartment"
    - text: 产业地图
  - text: 数据实时更新 · 点击板块查看详情 上证指数 3,876.78 +0.25% 深证成指 14,123.31 +0.44% 创业板指 3,575.52 +0.25% 上证50 2,978.77 -0.41% 沪深300 4,728 +0.23% 中证500 7,734.31 -0.22% 中证1000 7,195.5 +0.51% 科创50 1,789.69 -3.78% 中小100 8,714.92 +0.37% 板块宽度 31 涨 0 跌 100% 🏆 电力设备 景气度 75分 🏆 有色金属 景气度 51分
  - strong: 🏢 板块景气度评分
  - text: 综合评分 = 板块热度×50% + 成交活跃×30% + 赚钱效应×20% 行业板块 概念板块 一级 二级 75 高景气
  - strong: 电力设备
  - text: 253只 🔥31涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 50 💰 5 🎯 20 +3.95% 额1071.3亿
  - img "right"
  - text: 51 较活跃
  - strong: 有色金属
  - text: 155只 🔥9涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 39 💰 6 🎯 6 +3.10% 额1417.4亿
  - img "right"
  - text: 45 较活跃
  - strong: 基础化工
  - text: 402只 🔥11涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 33 💰 5 🎯 7 +2.60% 额1240.6亿
  - img "right"
  - text: 44 一般
  - strong: 机械设备
  - text: 411只 🔥14涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 29 💰 6 🎯 9 +2.27% 额1434.2亿
  - img "right"
  - text: 42 一般
  - strong: 环保
  - text: 66只 🔥2涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 41 💰 1 🎯 1 +3.20% 额127.9亿
  - img "right"
  - text: 41 一般
  - strong: 综合
  - text: 528只 🔥18涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 25 💰 4 🎯 12 +1.99% 额980.0亿
  - img "right"
  - text: 40 一般
  - strong: 电子
  - text: 786只 🔥11涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 3 💰 30 🎯 7 +0.25% 额7040.4亿
  - img "right"
  - text: 36 一般
  - strong: 国防军工
  - text: 39只 🔥1涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 35 💰 1 🎯 1 +2.77% 额159.4亿
  - img "right"
  - text: 36 一般
  - strong: 计算机
  - text: 762只 🔥8涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 19 💰 12 🎯 5 +1.48% 额2782.0亿
  - img "right"
  - text: 35 一般
  - strong: 建筑装饰
  - text: 103只 🔥3涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 33 💰 1 🎯 2 +2.58% 额150.7亿
  - img "right"
  - text: 34 一般
  - strong: 石油石化
  - text: 33只 🔥3涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 32 💰 1 🎯 2 +2.51% 额119.3亿
  - img "right"
  - text: 33 一般
  - strong: 轻工制造
  - text: 97只 🔥4涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 30 💰 1 🎯 3 +2.38% 额154.6亿
  - img "right"
  - text: 32 一般
  - strong: 纺织服饰
  - text: 91只 🔥3涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 29 💰 1 🎯 2 +2.33% 额118.0亿
  - img "right"
  - text: 32 一般
  - strong: 公用事业
  - text: 142只 🔥5涨停
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 25 💰 3 🎯 3 +1.97% 额803.2亿
  - img "right"
  - text: 31 一般
  - strong: 钢铁
  - text: 71只
  - button "apartment 产业链":
    - img "apartment"
    - text: 产业链
  - text: 🔥 30 💰 1 🎯 0 +2.37% 额128.5亿
  - img "right"
- img "message"
- button "切换到浅色模式": ☀️
- img "setting"
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
> 17  |     await expect(page.locator('.ant-layout-content')).toBeVisible();
      |                                                       ^ Error: expect(locator).toBeVisible() failed
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
```