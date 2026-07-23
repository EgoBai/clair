# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 潜力雷达页 >> 应该能访问潜力雷达
- Location: e2e/stock-app.spec.ts:170:7

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
        - heading "thunderbolt 潜力股雷达" [level=2] [ref=e11]:
          - img "thunderbolt" [ref=e12]:
            - img [ref=e13]
          - text: 潜力股雷达
        - button "reload 刷新" [ref=e15] [cursor=pointer]:
          - img "reload" [ref=e17]:
            - img [ref=e18]
          - generic [ref=e20]: 刷新
      - alert [ref=e21]:
        - img "info-circle" [ref=e22]:
          - img [ref=e23]
        - generic [ref=e25]:
          - generic [ref=e26]: 📋 当前为演示数据
          - generic [ref=e27]: 后端服务不可达，以下为示例潜力股供您预览。恢复后端服务后将自动切换至真实数据。
      - generic [ref=e28]:
        - generic [ref=e32]:
          - generic [ref=e33]: 入选数
          - generic [ref=e34]:
            - generic [ref=e35]: "5"
            - generic [ref=e36]: 只
        - generic [ref=e40]:
          - generic [ref=e41]: 平均分
          - generic [ref=e43]: "83.6"
        - generic [ref=e47]:
          - generic [ref=e48]: 平均涨幅
          - generic [ref=e49]:
            - generic [ref=e50]: "0.00"
            - generic [ref=e51]: "%"
        - generic [ref=e55]:
          - generic [ref=e56]: 模型版本
          - generic [ref=e58]: demo-data
      - generic [ref=e59]:
        - generic [ref=e60]: 筛选：
        - generic [ref=e61] [cursor=pointer]: 优质 (≥80分)
        - generic [ref=e62] [cursor=pointer]: 全部 (≥40分)
      - generic [ref=e63]:
        - generic [ref=e67]: 🤖AI 整体解读
        - generic [ref=e69]: ⚠️ 当前为演示数据。后端服务不可达，以下为示例潜力股供您预览。
      - generic [ref=e70]:
        - generic [ref=e72]:
          - generic [ref=e76]:
            - text: 因子雷达
            - generic [ref=e77]: 宁德时代 · 92分
          - img [ref=e81]:
            - generic [ref=e83]:
              - generic [ref=e90]: 动量
              - generic [ref=e92]: 成交
              - generic [ref=e94]: 估值
              - generic [ref=e95]: 规模
              - generic [ref=e97]: 行业
              - generic [ref=e99]: 质量
        - generic [ref=e109]:
          - generic [ref=e113]: 优质推荐 排行榜
          - generic [ref=e118]:
            - table [ref=e122]:
              - rowgroup [ref=e128]:
                - row "# 股票 综合分 涨跌% 上榜理由" [ref=e129]:
                  - columnheader "#" [ref=e130]
                  - columnheader "股票" [ref=e131]
                  - columnheader "综合分" [ref=e132] [cursor=pointer]:
                    - generic [ref=e133]:
                      - generic [ref=e134]: 综合分
                      - generic [ref=e136]:
                        - img [ref=e137]:
                          - img [ref=e138]
                        - img [ref=e140]:
                          - img [ref=e141]
                  - columnheader "涨跌%" [ref=e143] [cursor=pointer]:
                    - generic [ref=e144]:
                      - generic [ref=e145]: 涨跌%
                      - generic [ref=e147]:
                        - img [ref=e148]:
                          - img [ref=e149]
                        - img [ref=e151]:
                          - img [ref=e152]
                  - columnheader "上榜理由" [ref=e154]
              - rowgroup [ref=e155]:
                - generic:
                  - generic: 综合分
                  - generic:
                    - generic:
                      - img:
                        - img
                      - img:
                        - img
                - generic:
                  - generic: 涨跌%
                  - generic:
                    - generic:
                      - img:
                        - img
                      - img:
                        - img
                - row "1 宁德时代 300750.SZ 92 +0.00% 量价齐升 北向加仓 机构上调" [ref=e156] [cursor=pointer]:
                  - cell "1" [ref=e157]
                  - cell "宁德时代 300750.SZ" [ref=e158]:
                    - generic [ref=e159]:
                      - generic [ref=e160]: 宁德时代
                      - generic [ref=e161]: 300750.SZ
                  - cell "92" [ref=e162]
                  - cell "+0.00%" [ref=e163]:
                    - generic [ref=e164]: +0.00%
                  - cell "量价齐升 北向加仓 机构上调" [ref=e165]:
                    - generic [ref=e166]:
                      - generic [ref=e167]: 量价齐升
                      - generic [ref=e168]: 北向加仓
                      - generic [ref=e169]: 机构上调
                - row "2 比亚迪 002594.SZ 88 +0.00% 销量超预期 海外扩张 技术突破" [ref=e170] [cursor=pointer]:
                  - cell "2" [ref=e171]
                  - cell "比亚迪 002594.SZ" [ref=e172]:
                    - generic [ref=e173]:
                      - generic [ref=e174]: 比亚迪
                      - generic [ref=e175]: 002594.SZ
                  - cell "88" [ref=e176]
                  - cell "+0.00%" [ref=e177]:
                    - generic [ref=e178]: +0.00%
                  - cell "销量超预期 海外扩张 技术突破" [ref=e179]:
                    - generic [ref=e180]:
                      - generic [ref=e181]: 销量超预期
                      - generic [ref=e182]: 海外扩张
                      - generic [ref=e183]: 技术突破
                - row "3 贵州茅台 600519.SH 85 +0.00% 批价企稳 旺季临近 分红提升" [ref=e184] [cursor=pointer]:
                  - cell "3" [ref=e185]
                  - cell "贵州茅台 600519.SH" [ref=e186]:
                    - generic [ref=e187]:
                      - generic [ref=e188]: 贵州茅台
                      - generic [ref=e189]: 600519.SH
                  - cell "85" [ref=e190]
                  - cell "+0.00%" [ref=e191]:
                    - generic [ref=e192]: +0.00%
                  - cell "批价企稳 旺季临近 分红提升" [ref=e193]:
                    - generic [ref=e194]:
                      - generic [ref=e195]: 批价企稳
                      - generic [ref=e196]: 旺季临近
                      - generic [ref=e197]: 分红提升
                - row "4 五粮液 000858.SZ 78 +0.00% 动销改善 估值修复 渠道优化" [ref=e198] [cursor=pointer]:
                  - cell "4" [ref=e199]
                  - cell "五粮液 000858.SZ" [ref=e200]:
                    - generic [ref=e201]:
                      - generic [ref=e202]: 五粮液
                      - generic [ref=e203]: 000858.SZ
                  - cell "78" [ref=e204]
                  - cell "+0.00%" [ref=e205]:
                    - generic [ref=e206]: +0.00%
                  - cell "动销改善 估值修复 渠道优化" [ref=e207]:
                    - generic [ref=e208]:
                      - generic [ref=e209]: 动销改善
                      - generic [ref=e210]: 估值修复
                      - generic [ref=e211]: 渠道优化
                - row "5 中国平安 601318.SH 75 +0.00% 保费改善 低估值 回购加力" [ref=e212] [cursor=pointer]:
                  - cell "5" [ref=e213]
                  - cell "中国平安 601318.SH" [ref=e214]:
                    - generic [ref=e215]:
                      - generic [ref=e216]: 中国平安
                      - generic [ref=e217]: 601318.SH
                  - cell "75" [ref=e218]
                  - cell "+0.00%" [ref=e219]:
                    - generic [ref=e220]: +0.00%
                  - cell "保费改善 低估值 回购加力" [ref=e221]:
                    - generic [ref=e222]:
                      - generic [ref=e223]: 保费改善
                      - generic [ref=e224]: 低估值
                      - generic [ref=e225]: 回购加力
            - list [ref=e226]:
              - listitem "上一页" [ref=e227]:
                - button "left" [disabled] [ref=e228]:
                  - img "left" [ref=e229]:
                    - img [ref=e230]
              - listitem "1/1" [ref=e232]:
                - textbox "跳至" [ref=e233]: "1"
                - generic [ref=e234]: /
                - text: "1"
              - listitem "下一页" [ref=e235]:
                - button "right" [disabled] [ref=e236]:
                  - img "right" [ref=e237]:
                    - img [ref=e238]
  - generic "AI助手 — 随时提问" [ref=e240] [cursor=pointer]:
    - img "message" [ref=e241]:
      - img [ref=e242]
  - tablist "主导航" [ref=e244]:
    - tab "洞察" [ref=e245] [cursor=pointer]:
      - generic [ref=e246]: 🔭
      - generic [ref=e247]: 洞察
    - tab "选股" [ref=e248] [cursor=pointer]:
      - generic [ref=e249]: 🎯
      - generic [ref=e250]: 选股
    - tab "自选" [ref=e251] [cursor=pointer]:
      - generic [ref=e252]: ⭐
      - generic [ref=e253]: 自选
    - tab "产业" [ref=e254] [cursor=pointer]:
      - generic [ref=e255]: 🗺️
      - generic [ref=e256]: 产业
  - button "切换到浅色模式" [ref=e257] [cursor=pointer]: ☀️
  - img "setting" [ref=e259] [cursor=pointer]:
    - img [ref=e260]
```

# Test source

```ts
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
  165 |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  166 |   });
  167 | });
  168 | 
  169 | test.describe('潜力雷达页', () => {
  170 |   test('应该能访问潜力雷达', async ({ page }) => {
  171 |     await page.goto('/radar');
> 172 |     await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
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