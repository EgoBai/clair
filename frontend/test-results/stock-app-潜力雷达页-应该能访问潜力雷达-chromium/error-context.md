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
          - link "🏆 潜力雷达 ▶" [ref=e27] [cursor=pointer]:
            - /url: /radar
            - generic [ref=e28]: 🏆
            - generic [ref=e29]: 潜力雷达
            - generic [ref=e30]: ▶
        - listitem [ref=e31]:
          - link "📝 投资笔记" [ref=e32] [cursor=pointer]:
            - /url: /knowledge
            - generic [ref=e33]: 📝
            - generic [ref=e34]: 投资笔记
      - generic [ref=e35]:
        - generic [ref=e38]: 服务正常
        - generic [ref=e39]: v1.0.0
  - main [ref=e40]:
    - generic [ref=e44]:
      - generic [ref=e45]:
        - heading "thunderbolt 潜力股雷达" [level=2] [ref=e46]:
          - img "thunderbolt" [ref=e47]:
            - img [ref=e48]
          - text: 潜力股雷达
        - button "reload 刷新" [ref=e50] [cursor=pointer]:
          - img "reload" [ref=e52]:
            - img [ref=e53]
          - generic [ref=e55]: 刷新
      - alert [ref=e56]:
        - img "info-circle" [ref=e57]:
          - img [ref=e58]
        - generic [ref=e60]:
          - generic [ref=e61]: 📋 当前为演示数据
          - generic [ref=e62]: 后端服务不可达，以下为示例潜力股供您预览。恢复后端服务后将自动切换至真实数据。
      - generic [ref=e63]:
        - generic [ref=e67]:
          - generic [ref=e68]: 入选数
          - generic [ref=e69]:
            - generic [ref=e70]: "5"
            - generic [ref=e71]: 只
        - generic [ref=e75]:
          - generic [ref=e76]: 平均分
          - generic [ref=e78]: "83.6"
        - generic [ref=e82]:
          - generic [ref=e83]: 平均涨幅
          - generic [ref=e84]:
            - generic [ref=e85]: "0.00"
            - generic [ref=e86]: "%"
        - generic [ref=e90]:
          - generic [ref=e91]: 模型版本
          - generic [ref=e93]: demo-data
      - generic [ref=e94]:
        - generic [ref=e95]: 筛选：
        - generic [ref=e96] [cursor=pointer]: 优质 (≥80分)
        - generic [ref=e97] [cursor=pointer]: 全部 (≥40分)
      - generic [ref=e98]:
        - generic [ref=e102]: 🤖AI 整体解读
        - generic [ref=e104]: ⚠️ 当前为演示数据。后端服务不可达，以下为示例潜力股供您预览。
      - generic [ref=e105]:
        - generic [ref=e107]:
          - generic [ref=e111]:
            - text: 因子雷达
            - generic [ref=e112]: 宁德时代 · 92分
          - img [ref=e116]:
            - generic [ref=e118]:
              - generic [ref=e125]: 动量
              - generic [ref=e127]: 成交
              - generic [ref=e129]: 估值
              - generic [ref=e130]: 规模
              - generic [ref=e132]: 行业
              - generic [ref=e134]: 质量
        - generic [ref=e144]:
          - generic [ref=e148]: 优质推荐 排行榜
          - generic [ref=e153]:
            - table [ref=e157]:
              - rowgroup [ref=e166]:
                - row "# 股票 综合分 涨跌% 行业 上榜理由 市值(亿)" [ref=e167]:
                  - columnheader "#" [ref=e168]
                  - columnheader "股票" [ref=e169]
                  - columnheader "综合分" [ref=e170] [cursor=pointer]:
                    - generic [ref=e171]:
                      - generic [ref=e172]: 综合分
                      - generic [ref=e174]:
                        - img [ref=e175]:
                          - img [ref=e176]
                        - img [ref=e178]:
                          - img [ref=e179]
                  - columnheader "涨跌%" [ref=e181] [cursor=pointer]:
                    - generic [ref=e182]:
                      - generic [ref=e183]: 涨跌%
                      - generic [ref=e185]:
                        - img [ref=e186]:
                          - img [ref=e187]
                        - img [ref=e189]:
                          - img [ref=e190]
                  - columnheader "行业" [ref=e192]
                  - columnheader "上榜理由" [ref=e193]
                  - columnheader "市值(亿)" [ref=e194]
              - rowgroup [ref=e195]:
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
                - row "1 宁德时代 300750.SZ 92 +0.00% 电力设备 量价齐升 北向加仓 机构上调 —" [ref=e196] [cursor=pointer]:
                  - cell "1" [ref=e197]
                  - cell "宁德时代 300750.SZ" [ref=e198]:
                    - generic [ref=e199]:
                      - generic [ref=e200]: 宁德时代
                      - generic [ref=e201]: 300750.SZ
                  - cell "92" [ref=e202]
                  - cell "+0.00%" [ref=e203]:
                    - generic [ref=e204]: +0.00%
                  - cell "电力设备" [ref=e205]:
                    - generic [ref=e206]: 电力设备
                  - cell "量价齐升 北向加仓 机构上调" [ref=e207]:
                    - generic [ref=e208]:
                      - generic [ref=e209]: 量价齐升
                      - generic [ref=e210]: 北向加仓
                      - generic [ref=e211]: 机构上调
                  - cell "—" [ref=e212]
                - row "2 比亚迪 002594.SZ 88 +0.00% 汽车 销量超预期 海外扩张 技术突破 —" [ref=e213] [cursor=pointer]:
                  - cell "2" [ref=e214]
                  - cell "比亚迪 002594.SZ" [ref=e215]:
                    - generic [ref=e216]:
                      - generic [ref=e217]: 比亚迪
                      - generic [ref=e218]: 002594.SZ
                  - cell "88" [ref=e219]
                  - cell "+0.00%" [ref=e220]:
                    - generic [ref=e221]: +0.00%
                  - cell "汽车" [ref=e222]:
                    - generic [ref=e223]: 汽车
                  - cell "销量超预期 海外扩张 技术突破" [ref=e224]:
                    - generic [ref=e225]:
                      - generic [ref=e226]: 销量超预期
                      - generic [ref=e227]: 海外扩张
                      - generic [ref=e228]: 技术突破
                  - cell "—" [ref=e229]
                - row "3 贵州茅台 600519.SH 85 +0.00% 食品饮料 批价企稳 旺季临近 分红提升 —" [ref=e230] [cursor=pointer]:
                  - cell "3" [ref=e231]
                  - cell "贵州茅台 600519.SH" [ref=e232]:
                    - generic [ref=e233]:
                      - generic [ref=e234]: 贵州茅台
                      - generic [ref=e235]: 600519.SH
                  - cell "85" [ref=e236]
                  - cell "+0.00%" [ref=e237]:
                    - generic [ref=e238]: +0.00%
                  - cell "食品饮料" [ref=e239]:
                    - generic [ref=e240]: 食品饮料
                  - cell "批价企稳 旺季临近 分红提升" [ref=e241]:
                    - generic [ref=e242]:
                      - generic [ref=e243]: 批价企稳
                      - generic [ref=e244]: 旺季临近
                      - generic [ref=e245]: 分红提升
                  - cell "—" [ref=e246]
                - row "4 五粮液 000858.SZ 78 +0.00% 食品饮料 动销改善 估值修复 渠道优化 —" [ref=e247] [cursor=pointer]:
                  - cell "4" [ref=e248]
                  - cell "五粮液 000858.SZ" [ref=e249]:
                    - generic [ref=e250]:
                      - generic [ref=e251]: 五粮液
                      - generic [ref=e252]: 000858.SZ
                  - cell "78" [ref=e253]
                  - cell "+0.00%" [ref=e254]:
                    - generic [ref=e255]: +0.00%
                  - cell "食品饮料" [ref=e256]:
                    - generic [ref=e257]: 食品饮料
                  - cell "动销改善 估值修复 渠道优化" [ref=e258]:
                    - generic [ref=e259]:
                      - generic [ref=e260]: 动销改善
                      - generic [ref=e261]: 估值修复
                      - generic [ref=e262]: 渠道优化
                  - cell "—" [ref=e263]
                - row "5 中国平安 601318.SH 75 +0.00% 非银金融 保费改善 低估值 回购加力 —" [ref=e264] [cursor=pointer]:
                  - cell "5" [ref=e265]
                  - cell "中国平安 601318.SH" [ref=e266]:
                    - generic [ref=e267]:
                      - generic [ref=e268]: 中国平安
                      - generic [ref=e269]: 601318.SH
                  - cell "75" [ref=e270]
                  - cell "+0.00%" [ref=e271]:
                    - generic [ref=e272]: +0.00%
                  - cell "非银金融" [ref=e273]:
                    - generic [ref=e274]: 非银金融
                  - cell "保费改善 低估值 回购加力" [ref=e275]:
                    - generic [ref=e276]:
                      - generic [ref=e277]: 保费改善
                      - generic [ref=e278]: 低估值
                      - generic [ref=e279]: 回购加力
                  - cell "—" [ref=e280]
            - list [ref=e281]:
              - listitem "上一页" [ref=e282]:
                - button "left" [disabled] [ref=e283]:
                  - img "left" [ref=e284]:
                    - img [ref=e285]
              - listitem "1/1" [ref=e287]:
                - textbox "跳至" [ref=e288]: "1"
                - generic [ref=e289]: /
                - text: "1"
              - listitem "下一页" [ref=e290]:
                - button "right" [disabled] [ref=e291]:
                  - img "right" [ref=e292]:
                    - img [ref=e293]
  - generic "AI助手 — 随时提问" [ref=e295] [cursor=pointer]:
    - img "message" [ref=e296]:
      - img [ref=e297]
  - button "切换到浅色模式" [ref=e299] [cursor=pointer]: ☀️
  - img "setting" [ref=e301] [cursor=pointer]:
    - img [ref=e302]
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