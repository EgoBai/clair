# 澄观 Clair — 开发协作看板

> MiMoCode + Hermes Agent 并行开发协调
> 最后更新: 2026-06-29

## 协作规则

1. **文件锁机制** — 正在修改的文件记录在此，避免冲突
2. **分工明确** — MiMoCode 负责 UI/UX/前端交互/图表/多端适配，Hermes 负责后端/API/数据/AI功能
3. **文档互通** — 每完成一个模块，在此更新状态
4. **冲突预防** — 修改前先查看对方是否在改同一文件
5. **前端为主导** — 前端界面和交互设计由 MiMoCode 主导，Hermes 配合提供后端支持

## 当前分工（2026-06-29 更新）

| 角色 | 负责领域 | 当前任务 |
|------|----------|----------|
| **MiMoCode** | 前端UI/UX/图表/交互/多端适配/任务编排 | **前端界面优化主导**: K线图修复✅ + RadarPage✅ + 图表暗色主题统一✅ |
| **Hermes Agent** | 后端API/数据层/AI功能/业务逻辑 | 配合前端优化提供后端支持；待推进Phase 14后端部分 |
| **Builder Worker** | 具体代码实现 | 前端bug修复+Lint修复完成；待分派下一任务 |

## 文件锁

| 文件 | 锁定者 | 状态 | 说明 |
|------|--------|------|------|
| `frontend/src/services/websocket.ts` | MiMoCode | ✅ 完成 | Socket.IO 改造 |
| `frontend/package.json` | MiMoCode | ✅ 完成 | 添加 socket.io-client |
| `frontend/src/styles/responsive.css` | MiMoCode | ✅ 完成 | 多端设计系统 |
| `frontend/src/styles/pages-responsive.css` | MiMoCode | ✅ 完成 | 页面响应式规则 |
| `frontend/src/components/Layout/TabBar.tsx` | MiMoCode | ✅ 完成 | 移动端底部导航 |
| `frontend/src/components/Layout/AppLayout.tsx` | MiMoCode | ✅ 完成 | 集成TabBar |
| `frontend/src/components/Layout/NavigationMenu.tsx` | MiMoCode | ✅ 完成 | 移动端隐藏 |
| `frontend/src/main.tsx` | MiMoCode | ✅ 完成 | 导入响应式CSS |
| `frontend/index.html` | MiMoCode | ✅ 完成 | PWA viewport |
| `frontend/src/pages/DiscoverPage.tsx` | MiMoCode | ✅ 完成 | 响应式类名 |
| `frontend/src/pages/ScreenerPage.tsx` | MiMoCode | ✅ 完成 | 响应式类名 |
| `frontend/src/pages/WatchlistPage.tsx` | MiMoCode | ✅ 完成 | 响应式类名 |
| `frontend/src/pages/ReviewPage.tsx` | MiMoCode | ✅ 完成 | 响应式类名 |
| `frontend/public/manifest.json` | MiMoCode | ✅ 完成 | PWA配置 |

## 已完成的改动 (MiMoCode)

### 1. Vite Proxy 修复 ✅
- `frontend/.env` — 从绝对URL改为走proxy
- 效果：API和AI对话端到端可用

### 2. WebSocket Socket.IO 改造 ✅
- `frontend/src/services/websocket.ts` — 原生WebSocket → socket.io-client
- `frontend/package.json` — 添加 socket.io-client 依赖
- 效果：前后端协议对齐，实时行情可推送

### 3. 多端响应式适配 ✅ 核心框架完成
- **设计系统 CSS** (`styles/responsive.css`): 底部TabBar、安全区、卡片化表格、响应式网格
- **页面样式** (`styles/pages-responsive.css`): 各页面专属响应式规则
- **TabBar 组件** (`components/Layout/TabBar.tsx`): 移动端底部4Tab导航
- **AppLayout 改造**: 集成TabBar和响应式CSS
- **NavigationMenu**: 移动端完全隐藏，用TabBar替代
- **DiscoverPage**: 响应式类名替代 window.innerWidth
- **index.html**: viewport-fit=cover + PWA 支持
- **manifest.json**: orientation=any + display_override

## 待做清单（Phase 14: 质量闭环+产品深度）

### ✅ 已完成（本轮 2026-06-29）
- [x] 后端3个失败测试修复 ✅ (metrics.ts getSummary扩展、industries.ts import路径、industryChain*.ts Router导出)
- [x] 前端198个lint warnings修复 ✅ (unused vars前缀_，115个文件)
- [x] LLM市场解读增强 ✅ (后端 /ai/market-insight-llm 端点 + 前端fallback)
- [x] WatchlistPage AI总结 ✅
- [x] ReviewPage AI复盘 ✅
- [x] **K线图period参数修复** ✅ (StockDetailPage.tsx: fetch URL添加?period=)
- [x] **K线图/LinkedCharts暗色主题修复** ✅ (tooltip背景/文字/边框改为暗色)
- [x] **导出图片暗色背景** ✅ (KLineChart export backgroundColor→#0f172a)
- [x] **潜力股雷达页完成** ✅ (RadarPage.tsx: 六因子雷达图+Top50表格+理由标签+AI解读)
- [x] **雷达页路由+导航** ✅ (main.tsx + NavigationMenu.tsx)

### 🔄 前端界面优化计划（MiMoCode主导，Hermes配合）

#### P0 — 已完成（本轮）
- [x] K线图修复: period参数传递 + 暗色tooltip + 导出暗色背景
- [x] RadarPage: 六因子雷达图 + Top50评分榜 + 上榜理由标签
- [x] 图表暗色主题统一: KLineChart + LinkedCharts

#### P1 — 前端交互优化（下一阶段）
- [ ] K线图技术指标面板: MACD/KDJ/RSI副图切换优化
- [ ] K线图响应式: 移动端K线图高度自适应 + 触摸缩放
- [ ] ScreenerPage: 筛选结果表格性能优化（虚拟列表）
- [ ] DiscoverPage: 板块热力图交互增强（点击下钻到二级行业）
- [ ] WatchlistPage: 自选股拖拽排序 + 分组管理

#### P2 — 前端视觉优化
- [ ] 全局图表配色统一: 建立 chart-theme.ts 统一管理
- [ ] 页面过渡动画: 路由切换fade/slide动画
- [ ] 数据加载骨架屏: 替换纯spinner为骨架屏
- [ ] 空状态统一: 使用StateComponents.tsx统一组件

#### P3 — 多端体验提升
- [ ] 移动端K线图: 横屏全屏模式
- [ ] 移动端雷达图: 单列布局 + 滑动切换股票
- [ ] PWA增强: 离线缓存策略 + 添加到主屏幕

### 📋 Phase 15 待启动
- [ ] 潜力股雷达页前端 ✅ 已完成（见上方）
- [ ] 行业分类二级下钻: DiscoverPage + ScreenerPage 集成L2 API

## 修改日志 (Hermes Agent)

### 2026-06-15
- **ScreenerPage修复**: 添加symbol去重逻辑 + name.trim()防止空格导致重复显示
- **策略模板修复**: 价值投资模板从PE(全NULL)改为市值>100亿；动量策略从changePercent>5改为>3
- **版本同步**: 发现本地15个文件未推送，已全部同步到GitHub
- **文件**: ScreenerPage.tsx (去重+策略修复)

### 2026-06-25 (主Agent自主推进 — QA + 数据源 + 生产AI补齐)
- **6核心页面QA全过**: 发掘/筛选/自选/复盘/个股详情/产业地图，浏览器端到端验证渲染健康
- **K线图数据源接入** (commit e6eeb83): 新增 `GET /api/stocks/:symbol/kline`，从 daily_quotes 取数，支持日/周/月K聚合，日期归一 YYYY-MM-DD，返回格式对齐前端 `data.quotes` → StockDetailPage K线图 ECharts Canvas 渲染成功
- **三大AI功能本地端到端验证** (真DeepSeek): market-insight-llm / watchlist-summary / trade-analysis 全部返回高质量真实内容（数据真实、加粗格式、板块识别准确）→ 证明AI代码层面100%可用，生产仅差配key
- **Worker补 watchlist-summary 路由** (commit e30d4a1): 生产Worker原缺此端点（WatchlistPage已调用），移植 backend 实现 + 复用 callDeepSeek，契约对齐 `{symbols,quotes}→{summary}`，缺key优雅降级；node --check通过 + _worker.js同步
- **唯一生产卡点**: Cloudflare Pages 配 `DEEPSEEK_API_KEY`（用户操作）→ 配后 4 个 Worker AI 路由(gems/filter/trade-analysis/watchlist-summary)全部真实可用
- **文件**: backend/src/api/stock.ts (kline), clair-worker/worker.js + _worker.js (watchlist-summary)

---

## 🎯 潜力股雷达页 — 后端就绪交接（Hermes → MiMoCode）2026-06-25

> 用户要求两 Agent 组有机协作、不重复造轮子。Hermes 已确认+增强后端，**前端雷达页归 MiMoCode**。本段是无缝接手所需的全部信息。

### 分工边界（避免重复/冲突）
- **后端=Hermes 已完成**：六因子评分 + reasons 已就绪且生产可用，**MiMoCode 不需要、也不要碰** backend/clair-worker。
- **前端雷达页=MiMoCode 认领**：独立页面 + 多维可视化 + 多端适配（纯前端 UI，正是 MiMoCode 领域）。
- Hermes 承诺：不创建/修改前端雷达页文件，留给 MiMoCode。

### API 契约（已就绪，直接调用，无需新增后端）
- 端点：`POST /api/ai/gems`（前端经 `apiFetch` 自动路由：本地→:3001，生产→clair-api.pages.dev）
- 请求体：`{ "topN": 50, "minScore": 40 }`（topN 上限50；minScore 建议40）
- 响应结构：
```jsonc
{ "success": true, "data": {
  "gems": [{
    "symbol":"603039.SH", "name":"泛微网络", "price":12.3, "changePercent":4.5,
    "turnoverRate":6.2, "marketCap":120/*亿*/, "peRatio":35|null, "industry":"软件开发",
    "score":86,                                   // 综合分 0-100
    "momentumScore":20, "volumeScore":20, "valuationScore":10,
    "sizeScore":15, "industryScore":11, "qualityScore":10,   // 六因子分项(雷达图六维)
    "reasons":["涨势适中不追高","成交活跃换手健康","中盘成长空间"] // 新增:上榜理由(最多3,规则化非LLM)
  }],
  "total":4448, "model":"v2.0",
  "aiSummary":"整体解读(配DEEPSEEK_API_KEY后生效,缺key为空字符串)",
  "factors":{/*六因子说明*/}, "scoring":"总分=动量+成交+估值+规模+行业+质量"
}}
```
- 生产实测已验证：total=4448 真实全市场，六因子分项齐全，Top50 支持。

### 前端设计建议（区别于 ScreenerPage 现有 Top20 表格）
- 独立路由（建议 `/radar` 或 `/potential`）+ 导航入口；ScreenerPage 的 ai_gems Top20 表格保留即可，雷达页是更深的专属页。
- 核心可视化（已有 echarts 依赖可直接用）：
  1. **六因子雷达图**（ECharts radar，六维=momentum/volume/valuation/size/industry/quality）
  2. **评分榜 Top50**（卡片/表格，总分降序，#1-50）
  3. **上榜理由标签**（用 `reasons` 渲染 Tag/Chip — 体现"为什么有潜力"，产品差异化亮点，呼应"AI陪伴式引导>冷冰冰数据"）
  4. 点击行/卡 → 跳 `/stocks/:symbol`（已有路由）
- 整体解读区：展示 `aiSummary`（配key后真实，缺key隐藏/占位）。
- 暗色主题 + 红涨绿跌 + 移动端响应式（沿用 responsive.css / pages-responsive.css 体系）。

### 文件锁预登记
| 文件 | 归属 | 状态 |
|------|------|------|
| `frontend/src/pages/RadarPage.tsx` | MiMoCode | ✅ 已完成 |
| `frontend/src/main.tsx`（雷达页路由）| MiMoCode | ✅ 已完成 |
| `frontend/src/components/Layout/NavigationMenu.tsx` | MiMoCode | ✅ 已完成（+潜力雷达导航项）|
| `frontend/src/pages/StockDetailPage.tsx` | MiMoCode | ✅ 已完成（K线period修复）|
| `frontend/src/components/Charts/KLineChart.tsx` | MiMoCode | ✅ 已完成（暗色tooltip+导出）|
| `frontend/src/components/Charts/LinkedCharts.tsx` | MiMoCode | ✅ 已完成（暗色tooltip）|
| `backend/src/api/ai-gems.ts` | Hermes | ✅ 已完成(reasons)，勿动 |
| `clair-worker/worker.js`+`_worker.js` | Hermes | ✅ 已完成(reasons)，勿动 |

---

## 📊 行业分类重制 & L2 API 就绪（Hermes → MiMoCode）2026-06-25

Hermes 已完成申万2021二级行业分类重制。前端露出（DiscoverPage 板块分析切换一/二级、ScreenerPage 行业筛选下钻）可开始。

---

## 🎯 MiMoCode 任务 — 2026-07-01 (Loop S1)

### 任务1: 生产环境 Worker AI gems reasons 个性化
- **背景**: 本地后端 ai-gems.ts 已升级为个性化reasons(嵌入涨跌幅/换手率/市值), 但生产Worker仍用通用版
- **文件**: `clair-worker/worker.js` + `_worker.js`
- **描述**: 将本地 `backend/src/api/ai-gems.ts` 的reasons生成逻辑同步到Worker
- **契约**: POST /api/ai/gems 返回 `{gems:[{reasons:['涨势强劲+6.4%','成交活跃换手8.1%',...]}],...}`
- **优先级**: P2 (下次Worker部署时一并处理)

### 任务2: 前端预存TypeScript错误修复
- **背景**: 前端33个预存TS错误(多为`_Text`/`_Title`私有属性访问)
- **文件**: frontend/src/components/ 下的多个文件
- **描述**: 每次修5个, 逐步清零
- **优先级**: P2

### 协作确认
Hermes 已推送最新代码。MiMoCode 如需了解最新API变更, 查看 CLAIR-STANDARDS.md 第1.3节 API契约。

### 后端新增 API（可直接调用）

| 端点 | 说明 |
|------|------|
| `GET /api/industries?level=2` | 75个二级行业实时统计（stock_count / avg_change / avg_turnover / total_cap）|
| `GET /api/industries/level2/stocks?name=半导体` | 某二级行业的股票列表+最新行情（按市值降序，上限200只）|

### 数据状态
- `stocks.industry_level2` 列已写入 — 4481/5544 只 (80.8%) 分配到75个二级类别
- 申万2021分类引擎 + 映射表在 `data/` + `scripts/`
- 原 `stocks.industry` (一级31类) 不变，完全向后兼容

### 前端建议
- DiscoverPage 板块分析加 `级别: 一级/二级` 切换：调用 `?level=2` 获取75类统计
- ScreenerPage 行业筛选加二级下拉：先调 `?level=2` 获取列表名，再调 `level2/stocks?name=X` 查股
- 文件：DiscoverPage.tsx / ScreenerPage.tsx ← **MiMoCode 认领**
- Hermes 不碰这两个前端文件
