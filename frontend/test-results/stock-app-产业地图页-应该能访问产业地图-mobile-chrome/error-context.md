# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 产业地图页 >> 应该能访问产业地图
- Location: e2e/stock-app.spec.ts:162:7

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
- main:
  - heading "apartment AI 产业地图" [level=2]:
    - img "apartment"
    - text: AI 产业地图
  - text: 快速了解产业链结构、投资逻辑，发现核心标的
  - button "filter 策略选股":
    - img "filter"
    - text: 策略选股
  - button "star 自选追踪":
    - img "star"
    - text: 自选追踪
  - button "rise 市场洞察":
    - img "rise"
    - text: 市场洞察
  - strong:
    - img "thunderbolt"
    - text: 实时热门板块
  - text: 景气度 × 资金流向 Top5 动力电池+2.9%景气79分 新能源汽车+4.1%景气91分 光伏-1.9%景气32分 涉及公司 54家 龙头企业 21家 平均涨幅
  - img "fall"
  - text: "-1.62% 总市值 112336亿"
  - img "apartment"
  - text: 产业链图谱
  - img "info-circle"
  - img:
    - button "Edge from optical-chip to optical-module"
    - button "Edge from pcb to server"
    - button "Edge from optical-module to switch"
    - button "Edge from switch to data-center"
    - button "Edge from server to data-center"
    - button "Edge from data-center to ai-app"
  - button "上游 3家龙头 光芯片 光通信核心器件，决定传输速率和距离... 8家公司 +1.10%"
  - button "上游 3家龙头 PCB/载板 电子元器件基础，支撑芯片封装... 9家公司 +1.32%"
  - button "中游 3家龙头 光模块 光电转换核心器件，数据中心互联关键... 10家公司 +5.86%"
  - button "中游 3家龙头 交换机 网络核心设备，数据中心流量枢纽... 7家公司 +3.57%"
  - button "中游 3家龙头 服务器 算力载体，AI训练和推理基础... 7家公司 +0.39%"
  - button "下游 3家龙头 数据中心 算力基础设施，AI应用载体... 6家公司 +0.60%"
  - button "下游 3家龙头 AI应用 AI技术落地，创造商业价值... 7家公司 -0.64%"
  - button "zoom in":
    - img
  - button "zoom out" [disabled]:
    - img
  - button "fit view":
    - img
  - button "toggle interactivity":
    - img
  - img
  - link "React Flow attribution":
    - /url: https://reactflow.dev
    - text: React Flow
  - img "rocket"
  - text: AI 产业链解读
  - tablist:
    - tab "概述" [selected]
    - tab "投资逻辑"
    - tab "风险提示"
    - tab "核心洞察"
  - tabpanel "概述": AI算力产业链是当前市场最热门的投资主线之一。随着ChatGPT等大模型的爆发，AI算力需求呈现指数级增长，带动整个产业链从上游芯片到下游应用全面受益。
  - img "question-circle"
  - text: AI 问答
  - textbox "询问产业链相关问题..."
  - button "send 提问":
    - img "send"
    - text: 提问
  - text: 投资逻辑 弹性最大 龙头企业 时间窗口 核心壁垒 风险提示
- img "message"
- tablist "主导航":
  - tab "洞察": 🔭 洞察
  - tab "选股": 🎯 选股
  - tab "自选": ⭐ 自选
  - tab "产业" [selected]: 🗺️ 产业
- button "切换到浅色模式": ☀️
- img "setting"
```

# Test source

```ts
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
> 165 |     await expect(page.locator('.ant-layout-content')).toBeVisible();
      |                                                       ^ Error: expect(locator).toBeVisible() failed
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