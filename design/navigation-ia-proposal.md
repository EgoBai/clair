# 澄观 Clair · 导航信息架构（IA）梳理方案

> 角色：UI/UX 专家（Mimo）
> 里程碑：D7 前端现代化 · 第一步（导航 IA 梳理）
> 关联文档：`design/frontend-modernization-strategy.md`（D7 架构）、`requirements/frontend-experience-design-language.md`（体验设计语言）、`design/ai-native-architecture.md`（P0–P3 四阶段）
> 性质：**纯文档提案，本文件不改变任何 `src/` 代码**；所有改动以 Ticket 形式列于 §5，待评审后实施。

---

## 0. 目标与原则

**目标**：把现有 33 条路由从"早期侧栏 + 零散入口"重构为**按投研工作流分组、可发现、可检索、多端一致**的导航体系，让目前只能 URL 直达的页面（compare / lockup-calendar / top-traders / margin-trading / macro / event-calendar / risk-center / report-center / north-bound / backtest / factor-lab / hk-connect / etf / fund-flow / journey / strategies 等）具备稳定入口。

**原则**（承接 D7 与体验设计语言）：
1. **闭环旅程理念**：导航服务于「探索 → 求证 → 决策 → 复盘 → 成长」循环，而非简单堆功能。
2. **复用优先**：保留 react-router-dom / antd5 / Zustand，不引入新路由框架或新 UI 框架。
3. **可发现性优先**：每个"激活页/整合页"至少拥有一个一级或二级导航入口。
4. **多端一致**：桌面侧栏、平板折叠、移动底部 Tab（≤5 + 更多），与 `frontend-experience-design-language.md §4` 断点对齐。
5. **AI 在场**：伴生光球（Companion Orb）作为导航锚点外的常驻引导，不替代导航结构。

---

## 1. 现状审计（基于真实 `src/routes/paths.ts` 与 `src/routes/index.tsx`）

### 1.1 入口现状

| 现状组件 | 位置 | 暴露的页面 | 问题 |
|---|---|---|---|
| `NavigationMenu`（桌面侧栏） | `src/components/Layout/NavigationMenu.tsx` | 市场洞察/策略选股/自选组合/产业地图/潜力雷达/投资笔记（6 项） | emoji 图标、硬编码 `#1a1a2e` 渐变、无分组、无折叠 |
| `TabBar`（移动底部） | `src/components/Layout/TabBar.tsx` | 洞察/选股/自选/产业（4 项） | 与侧栏不同步，未含成长/持仓 |
| `GlobalSearch`（孤儿） | `src/components/Common/GlobalSearch.tsx` | — | **已定义但从未挂载**；AppLayout 的 ⌘K 处理器（line 21-31）聚焦 `[data-search-input]`，而该属性仅 GlobalSearch 设置 → ⌘K 实际失效 |
| 详情页（`:symbol`） | 经列表/卡片链接到达 | 个股/财务/指数/板块详情 | 无面包屑、无导航归属，易"迷路" |

### 1.2 33 条路由全清单

> 来源：`src/routes/index.tsx` 的 `<Route>` 表（共 33 个定义）。其中 **4 条未在 `paths.ts` 注册 `ROUTE_PATHS` 常量**（已标注 ⚠），属真实可达路由但缺少路径常量，建议补齐。

| # | 路由 Path | 页面组件 | 功能 | 当前入口 | 可发现性 |
|---|---|---|---|---|---|
| 1 | `/` | DiscoverPage | 市场洞察 / 发掘首页 | 侧栏 + TabBar | ✅ 有 |
| 2 | `/screener` | ScreenerPage | 策略选股 | 侧栏 + TabBar | ✅ 有 |
| 3 | `/watchlist` | WatchlistHubPage | 自选组合 | 侧栏 + TabBar | ✅ 有 |
| 4 | `/review` | →`/watchlist?tab=review` | 复盘（重定向） | 经自选"复盘" tab | 🟡 间接 |
| 5 | `/market` | →`/` | 市场（历史别名，重定向） | 无独立入口 | ❌ 无（重定向） |
| 6 | `/stocks` | StockListPage | 股票列表 | 列表链接可达 | 🟡 详情级（无导航项） |
| 7 | `/stocks/:symbol` | StockDetailPage | 个股详情 | 链接可达 | 🟡 详情级 |
| 8 | `/financials/:symbol` | FinancialsPage | 财务三表 | 链接可达 | 🟡 详情级 |
| 9 | `/index/:symbol` | IndexDetailPage | 指数详情 | 链接可达 | 🟡 详情级 ⚠未注册 |
| 10 | `/sectors/:symbol` | SectorDetailPage | 板块详情 | 链接可达 | 🟡 详情级 ⚠未注册 |
| 11 | `/backtest` | BacktestPage | 回测 | URL 直达 | ❌ 无 |
| 12 | `/industry-map` | IndustryMapPage | 产业地图 | 侧栏 + TabBar | ✅ 有 |
| 13 | `/radar` | RadarPage | 潜力雷达 | 侧栏 | ✅ 有 ⚠未注册 |
| 14 | `/compare` | StockComparePage | 同业对比 | URL 直达 | ❌ 无 |
| 15 | `/lockup-calendar` | LockupCalendarPage | 解禁日历 | URL 直达 | ❌ 无 |
| 16 | `/top-traders` | TopTradersPage | 龙虎榜 | URL 直达 | ❌ 无 |
| 17 | `/margin-trading` | MarginTradingPage | 融资融券 | URL 直达 | ❌ 无 |
| 18 | `/portfolio` | PortfolioPage | 投资组合 | URL 直达 | ❌ 无 |
| 19 | `/macro` | MacroPage | 宏观仪表盘 | URL 直达 | ❌ 无 |
| 20 | `/event-calendar` | EventCalendarPage | 事件日历 | URL 直达 | ❌ 无 |
| 21 | `/risk-center` | RiskCenterPage | 组合风控中心 | URL 直达 | ❌ 无 |
| 22 | `/report-center` | ReportCenterPage | 研报 AI 摘要 | URL 直达 | ❌ 无 |
| 23 | `/north-bound` | NorthBoundPage | 北向资金 | URL 直达 | ❌ 无 |
| 24 | `/factor-lab` | FactorLabPage | 多因子实验室 | URL 直达 | ❌ 无 |
| 25 | `/hk-connect` | HKConnectPage | 港股通 | URL 直达 | ❌ 无 |
| 26 | `/etf` | ETFPage | ETF 中心 | URL 直达 | ❌ 无 |
| 27 | `/fund-flow` | FundFlowPage | 资金流向 | URL 直达 | ❌ 无 |
| 28 | `/journey` | JourneyPage | 成长中心 | URL 直达 | ❌ 无 |
| 29 | `/knowledge` | KnowledgeBase | 投资笔记 | 侧栏 | ✅ 有 ⚠未注册 |
| 30 | `/strategies` | StrategyTemplatesPage | 策略模板 | URL 直达 | ❌ 无 |
| 31 | `/home` | →`/` | 别名重定向 | 无 | ❌ 无 |
| 32 | `/index` | →`/` | 别名重定向 | 无 | ❌ 无 |
| 33 | `*` | NotFoundPage | 404 | 系统 | — |

### 1.3 审计结论

- **真实页面路由 30 条**（不含 3 条重定向 + 404）。其中仅 **6 条**有导航入口，占比 20%；**16 条**完全不可发现（只能 URL 直达）；**8 条**为详情级（经链接可达但无导航归属）。
- **4 条路由缺 `paths.ts` 常量**（#9 `#index/:symbol`、#10 `#sectors/:symbol`、#13 `/radar`、#29 `/knowledge`）—— 属实现遗漏，建议补注册（非本方案必需，但推荐）。
- **搜索缺失**：GlobalSearch 已具备完整交互（防抖/历史/键盘导航），却未挂载，⌘K 是死键。这是成本最低、收益最高的"可发现性"补洞点。

---

## 2. IA 分组方案

### 2.1 推荐案：按投研工作流分组（6 组，每组 ≤6 项）

> 理念：以"用户做什么研究任务"而非"技术模块"划分。详情级路由（`:symbol`）不进静态树，改由面包屑 + 上下文入口承载。

**侧栏两级结构树**

```
澄观 Clair · 水静则明
├─ 🟦 市场总览 Overview
│   ├─ 市场洞察        /            DashboardOutlined
│   ├─ 宏观仪表盘      /macro        GlobalOutlined
│   ├─ 产业地图        /industry-map NodeIndexOutlined
│   ├─ 潜力雷达        /radar        RadarChartOutlined
│   ├─ 资金流向        /fund-flow    FundOutlined
│   └─ 事件日历        /event-calendar CalendarOutlined
├─ 🟦 个股研究 Research
│   ├─ 策略选股        /screener     FilterOutlined
│   ├─ 股票列表        /stocks       UnorderedListOutlined
│   ├─ 同业对比        /compare      DiffOutlined
│   ├─ 研报 AI 摘要    /report-center FileSearchOutlined
│   ├─ 龙虎榜          /top-traders  TrophyOutlined
│   └─ 解禁日历        /lockup-calendar AlertOutlined
├─ 🟦 资金面 Capital
│   ├─ 北向资金        /north-bound   ArrowLeftOutlined
│   ├─ 融资融券        /margin-trading BankOutlined
│   ├─ 港股通          /hk-connect    LinkOutlined
│   └─ ETF 中心        /etf           PieChartOutlined
├─ 🟦 组合与风控 Portfolio
│   ├─ 自选组合        /watchlist     StarOutlined
│   ├─ 投资组合        /portfolio     WalletOutlined
│   ├─ 组合风控        /risk-center   SafetyCertificateOutlined
│   └─ 投资笔记        /knowledge     FileTextOutlined
├─ 🟦 量化实验 Quant
│   ├─ 回测            /backtest      HistoryOutlined
│   ├─ 策略模板        /strategies    ProfileOutlined
│   └─ 多因子实验室    /factor-lab    ThunderboltOutlined
└─ 🟦 成长旅程 Growth
    └─ 成长中心        /journey       RocketOutlined
```

**分组理由（排序逻辑）**
- **市场总览**置顶：对应闭环「探索」阶段，是用户每日入口；宏观/产业/雷达/资金流/事件均属"看大势"。
- **个股研究**次之：对应「求证」；把选股、对比、研报、龙虎榜、解禁集中，研究者可一站式深入单只标的。
- **资金面**独立成组：北向/两融/港股通/ETF 是 A股特色资金维度，实操中常被一起查看，合并降低认知负担。
- **组合与风控**：对应「决策/持有」；自选、持仓、风控、笔记同组，承载"我的资产"。
- **量化实验**：对应进阶「求证/决策」；回测/策略/因子面向专业用户，故靠后、不与入门流混排。
- **成长旅程**末尾单列：对应「成长」阶段，承载游戏化（JourneyStage），与伴生光球强关联。

> 详情页（#7 `/stocks/:symbol`、#8 `/financials/:symbol`、#9 `/index/:symbol`、#10 `/sectors/:symbol`）不进入上述静态树，由**面包屑 + 来源页上下文链接**可达，避免树过深。

### 2.2 备选案：旅程阶段驱动导航（5 阶段）

> 承接体验设计语言 §1.4「探索→求证→决策→复盘→成长」与 §7 开放问题 5。以闭环阶段为一级，Companion Orb 高亮当前阶段。

```
澄观 Clair
├─ 探索 Explore   → / · /macro · /industry-map · /radar · /fund-flow · /event-calendar
├─ 求证 Research  → /stocks · /stocks/:symbol · /financials/:symbol · /compare · /report-center · /top-traders · /lockup-calendar
├─ 决策 Decide    → /screener · /strategies · /portfolio · /risk-center · /watchlist
├─ 复盘 Review    → /knowledge · /watchlist?tab=review
└─ 成长 LevelUp   → /journey · /backtest · /factor-lab · /north-bound · /margin-trading · /hk-connect · /etf
```

**取舍**：备选案叙事更强、与游戏化闭环高度契合，但会把同类工具（如资金面 4 项）打散到不同层，专业用户查找成本上升。**推荐采用推荐案**（工作流分组），同时用 **Companion Orb 在侧栏高亮"当前所处阶段"** 兼得两者——既保留分组的可查找性，又表达闭环。备选案作为 P2（游戏化叠加）阶段再评估是否切换为默认。

### 2.3 逐项 icon 与命名对照表（antd 实名）

| 分组 | 页面 | 路由 | antd icon | 选择理由 |
|---|---|---|---|---|
| 市场总览 | 市场洞察 | `/` | `DashboardOutlined` | 总览仪表盘语义，承接"发掘"首页 |
| 市场总览 | 宏观仪表盘 | `/macro` | `GlobalOutlined` | 全局/宏观视野 |
| 市场总览 | 产业地图 | `/industry-map` | `NodeIndexOutlined` | 产业链节点图谱 |
| 市场总览 | 潜力雷达 | `/radar` | `RadarChartOutlined` | 雷达扫描"潜力"意象 |
| 市场总览 | 资金流向 | `/fund-flow` | `FundOutlined` | 资金/基金流向 |
| 市场总览 | 事件日历 | `/event-calendar` | `CalendarOutlined` | 日历事件 |
| 个股研究 | 策略选股 | `/screener` | `FilterOutlined` | 筛选/过滤 |
| 个股研究 | 股票列表 | `/stocks` | `UnorderedListOutlined` | 列表 |
| 个股研究 | 同业对比 | `/compare` | `DiffOutlined` | 差异对比 |
| 个股研究 | 研报 AI 摘要 | `/report-center` | `FileSearchOutlined` | 研报检索 |
| 个股研究 | 龙虎榜 | `/top-traders` | `TrophyOutlined` | 榜单/领先 |
| 个股研究 | 解禁日历 | `/lockup-calendar` | `AlertOutlined` | 解禁风险预警 |
| 资金面 | 北向资金 | `/north-bound` | `ArrowLeftOutlined` | 北向流入箭头 |
| 资金面 | 融资融券 | `/margin-trading` | `BankOutlined` | 券商/杠杆 |
| 资金面 | 港股通 | `/hk-connect` | `LinkOutlined` | 跨市场连接 |
| 资金面 | ETF 中心 | `/etf` | `PieChartOutlined` | 组合/配置 |
| 组合与风控 | 自选组合 | `/watchlist` | `StarOutlined` | 收藏 |
| 组合与风控 | 投资组合 | `/portfolio` | `WalletOutlined` | 持仓钱包 |
| 组合与风控 | 组合风控 | `/risk-center` | `SafetyCertificateOutlined` | 安全/认证 |
| 组合与风控 | 投资笔记 | `/knowledge` | `FileTextOutlined` | 笔记文档 |
| 量化实验 | 回测 | `/backtest` | `HistoryOutlined` | 历史回放 |
| 量化实验 | 策略模板 | `/strategies` | `ProfileOutlined` | 策略画像 |
| 量化实验 | 多因子实验室 | `/factor-lab` | `ThunderboltOutlined` | 因子/能量 |
| 成长旅程 | 成长中心 | `/journey` | `RocketOutlined` | 起飞/进阶 |

> 全部为 `@ant-design/icons` 真实导出名（v5），无臆造。emoji（🔭🎯⭐ 等）仅保留在品牌占位，正式版统一切换为 antd icon + `--clair-accent` 主色，确保深浅色与 A股蓝 `#2962FF` 一致。

---

## 3. 搜索与快捷（为 D3 拍板提供依据）

### 3.1 现状
- `GlobalSearch.tsx` 已完整实现：`onSearch` / `onSelect` 回调、`useDebounce`、`useSearchHistory`、`SearchHighlight`、键盘上下选择、⌘K 提示文案、且已带 `data-search-input` 属性。
- **从未被 import**（grep 全 `src/` 仅自身定义）。AppLayout line 21-31 的 ⌘K 处理器依赖 `[data-search-input]` 节点——节点不存在 → ⌘K 无反应。

### 3.2 推荐挂载位置：**顶部 Header 常驻搜索框（⌘K 唤起）**
- 与导航**互补而非替代**：导航解决"我知道要做什么任务"；搜索解决"我知道代码/名称，或想直达某页"。
- 搜索两类结果：① **股票/标的**（symbol/name → 跳 `/stocks/:symbol`）；② **页面跳转**（输入"回测""资金"等 → 跳对应路由），需构建一个轻量 `PAGE_INDEX`（由 §2.1 的树派生）。

### 3.3 具体集成点（A 方案：恢复并挂载）
> 提供给 D3 决策的"最小恢复"路径：

1. **挂载点**：在 `AppLayout.tsx` 的 `.app-content` 顶部新增 `<Header>`，渲染 `<GlobalSearch onSearch={...} onSelect={...} />`。`data-search-input` 已内置于组件，现有 ⌘K 处理器（line 21-31）**无需改动即自动生效**。
2. **onSelect**：`navigate(getRoutePath('STOCK_DETAIL', { symbol: result.symbol }))`（需在 `paths.ts` 补 `#9/#10` 常量或复用 `STOCK_DETAIL`）。
3. **onSearch 数据源**：接入现有股票搜索 service（项目已含 `SearchHighlight`/`useSearchHistory`，应有对应搜索 API；**若缺失则需先确认数据来源——列为 D3 前置疑问**）。
4. **移动端**：搜索框在 `xs/sm` 收为 Header 的 ⌘K/放大镜图标按钮，点击展开全宽浮层（避免 `backdrop-filter` 全屏锁死，符合体验语言 §4.3）。
5. **占位符与 discovered 页索引**：`PAGE_INDEX` 由 §2.1 分组树自动生成，保证搜索能直达所有 30 个页面。

### 3.4 D3 拍板清单
- [ ] **A 恢复并挂载**（推荐，成本最低、收益最高）｜ vs B 暂不动（保留 ⌘K 占位）。
- [ ] onSearch 数据源是否已具备？缺失则本 Ticket 阻塞，需后端/数据层确认。
- [ ] 搜索结果是否纳入"页面跳转"能力（建议纳入，强化可发现性）。

---

## 4. 响应式策略（对齐体验设计语言 §4）

### 4.1 断点与布局

| 断点 | 范围 | 导航形态 | 说明 |
|---|---|---|---|
| `lg/xl` 桌面 | ≥1024px | **常驻侧栏**（两级折叠树） | 默认展开分组；宽度 240px（token 化） |
| `md` 平板横 | 768–1023px | **可折叠侧栏 / 图标轨道** | 收为 icon-only rail（宽 64px），hover/点击展开分组；或左侧抽屉 |
| `sm` 平板竖 | 480–767px | **抽屉式侧栏** | 汉堡键唤起，遮罩关闭（沿用现有 mobile-menu-overlay 思路） |
| `xs` 移动 | <480px | **底部 TabBar（≤5 + 更多）** | 5 个主入口，其余收进"更多"底部弹层 |

### 4.2 桌面侧栏折叠态
- 提供"展开 / 图标 / 隐藏"三态。图标态仅显示 antd icon + tooltip（满足 44px 触控目标，禁用纯 hover-only 功能）。
- 折叠状态记忆于 `useAppStore.UIPreferences`（承接 D7 策略 §1.4 密度/偏好）。

### 4.3 移动端底部 Tab（≤5）
当前 `TabBar` 仅 4 项（洞察/选股/自选/产业）。建议固化 **5 主入口 + 更多**：

```
[洞察 /]  [选股 /screener]  [自选 /watchlist]  [产业 /industry-map]  [更多 ▦]
```
- "更多"点击展开底部 Sheet，列出剩余分组（资金面/组合/量化/成长），结构与桌面侧栏一致。
- TabBar 高度 56px（含 `env(safe-area-inset-bottom)`），图标 ≥44×44。
- 成长中心 `/journey` 不占主 Tab，由伴生光球 + 更多入口引导，避免 Tab 过载（呼应体验语言 §7 开放问题 5）。

### 4.4 与体验设计语言一致性
- 颜色/圆角/间距全部消费 `--clair-*` token，移除 `NavigationMenu.tsx` 内 `#1a1a2e` 渐变硬编码（见 §5 T3）。
- 触控 ≥44px、无 hover-only、reduced-motion 分支，均满足 D6 守卫。
- Companion Orb 锚定侧栏底部或页面侧缘，读 `CompanionState`，与导航并存不互斥。

### 4.5 形态示意（ASCII Mockup）

**桌面（lg/xl）常驻侧栏**
```
┌──────────────┬──────────────────────────────┐
│ 澄观 Clair    │  [🔍 搜索股票 / 页面 ⌘K]      │
│ 水静则明      ├──────────────────────────────┤
│              │                               │
│ ▸ 市场总览    │   < 页面内容 >                │
│   市场洞察    │                               │
│   宏观仪表盘  │                               │
│   产业地图    │   ● Companion Orb（侧缘常驻） │
│   潜力雷达    │                               │
│   资金流向    │                               │
│   事件日历    │                               │
│ ▸ 个股研究    │                               │
│ ▸ 资金面      │                               │
│ ▸ 组合与风控  │                               │
│ ▸ 量化实验    │                               │
│ ▸ 成长旅程    │                               │
└──────────────┴──────────────────────────────┘
```

**移动（xs）底部 Tab**
```
┌────────────────────────────────────────────┐
│                < 页面内容 >                  │
│                                             │
│                  ● Orb                      │
├──────┬──────┬──────┬──────┬────────────────┤
│ 洞察 │ 选股 │ 自选 │ 产业 │ 更多 ▦          │
└──────┴──────┴──────┴──────┴────────────────┘
        ↑ 更多 → 底部 Sheet 列出 资金面/组合/量化/成长
```

### 4.6 可访问性（A11y）要点
- 侧栏 `<nav aria-label="主导航">`，分组用 `<button aria-expanded>` 控制折叠，子项 `aria-current="page"` 标记当前路由。
- 图标按钮均带 `aria-label`（禁用纯图标无语义）。
- 键盘：Tab 顺序 = 侧栏分组 → 子项 → 内容；⌘K 全局聚焦搜索；Esc 关闭浮层/抽屉。
- 满足体验语言 §6「无 hover-only」「触控 ≥44px」「reduced-motion 退化淡入」三条 D6 守卫。

---

## 5. 实施拆解（Ticket 列表）

> 约定：每个 Ticket 改动 <300 行；标注涉及文件、依赖顺序、是否等 D3/用户拍板。**仅规划，不实施**。

| # | Ticket | 涉及文件 | 依赖 | 需拍板 |
|---|---|---|---|---|
| T1 | 抽取 `NAV_GROUPS` 配置（§2.1 树，含 icon/order） | 新建 `src/config/navGroups.ts`（或并入 `routes/paths.ts`）；`NavigationMenu.tsx` 引用 | IA 评审通过 | 否 |
| T2 | 两级可折叠侧栏 UI（分组 + 子项 + 折叠态） | `NavigationMenu.tsx` | T1 | 否 |
| T3 | 侧栏样式 token 化（替换硬编码渐变/颜色为 `--clair-*`） | `NavigationMenu.tsx` | T2 | 否 |
| T4 | 顶部 Header + GlobalSearch 挂载（D3-A） | `AppLayout.tsx`、`GlobalSearch.tsx` | T1（PAGE_INDEX） | **是（D3）** |
| T5 | ⌘K 验证 + 页面跳转索引 `PAGE_INDEX` | `GlobalSearch.tsx`、T4 产出 | T4 | **是（D3 数据源）** |
| T6 | 移动端 TabBar 扩展为 5 + 更多 Sheet | `TabBar.tsx` | T1 | 否 |
| T7 | 平板折叠行为（md 图标轨道 / 抽屉） | `NavigationMenu.tsx` + `responsive.css` | T2、D7 响应式断点统一 | 否 |
| T8 | 详情页面包屑（`:symbol` 归属导航） | 各 Detail 页 + 新增 `Breadcrumb` | T1 | 否 |
| T9 | Companion Orb 导航锚点集成（读 `CompanionState`） | `AppLayout.tsx`、FloatingChat 升级 | P1/P2（伴生引擎） | 否（分阶段） |
| T10 | `paths.ts` 补注册 #9/#10/#13/#29 常量 | `paths.ts`、`routes/index.tsx` | 无 | 否 |
| T11 | NavigationMenu 单测更新（分组/active/折叠） | `__tests__/components/NavigationMenu.test.tsx` | T1–T3 | 否 |
| T12 | 备选案（旅程阶段导航）P2 评估开关 | `navGroups.ts` + Feature Flag | 推荐案上线后 | 否（P2） |

**依赖链**：IA 评审 → T1 → (T2→T3→T7 / T8 / T11) 并行；T4/T5 阻塞于 D3 拍板；T9 随 P1/P2 伴生落地；T10 独立可先行。
**需用户拍板**：T4（是否恢复 GlobalSearch）、T5（搜索数据源）、T12（P2 是否切换备选案）。

### 5.1 上线顺序建议（对齐 P0–P3）
1. **P0（地基）**：T10（补常量）→ T1（配置）→ T2/T3（侧栏现代化，纯展示层，不影响数据）。这阶段即可让 16 个不可发现页面获得入口，ROI 最高。
2. **P0/P1 交界**：T6/T7（响应式补齐），让平板/移动与桌面一致。
3. **依赖 D3 拍板**：T4/T5（搜索）建议在 P1 前完成，因 ⌘K 死键是明显体验缺陷，且 GlobalSearch 已就绪、成本极低。
4. **P1/P2**：T8（面包屑）、T9（Companion Orb 锚点）、T11（测试）。
5. **P2 评估**：T12（备选案旅程导航开关）。

> 每阶段均满足 D6 轻量守卫（token 无魔法值、无 hover-only、触控 ≥44px），可灰度回退。

---

## 6. 不做清单（明确边界）

1. **不修改任何路由 path**：`ROUTE_PATHS` 的路径字符串、`index.tsx` 的 `<Route path>` 一律不动；仅补常量（T10）不删不改既有路径。
2. **不删除/隐藏任何页面**：所有 30 个页面保留，仅新增导航入口提升可发现性。
3. **不引入新框架**：不换路由库（保持 react-router-dom）、不引新 UI 库（antd5 保留）、不引 Tailwind 作为 CSS reset（遵循 D7 策略 §2.5 关闭 preflight）。
4. **不重写业务页面**：本方案只动导航壳层（`NavigationMenu`/`TabBar`/`AppLayout` 头部）与配置，不动各 Page 内部逻辑。
5. **不绑定伴生实现**：Companion Orb（T9）仅预留锚点与读取契约，不在此实现 AI 逻辑。
6. **不触碰 demoData 兜底**：遵循 D7 策略"纯展示层演进"，数据兜底不受影响。

---

## 7. 验收自检（提案侧）

- [x] 路由清单与 `src/routes/index.tsx` 完全一致：**33 条**（30 真实页 + 3 重定向 + 404），其中 4 条缺 `paths.ts` 常量已标注。
- [x] 分组方案每组 ≤6 项，icon 用 antd 实名（DashboardOutlined / GlobalOutlined / NodeIndexOutlined / RadarChartOutlined / FundOutlined / CalendarOutlined / FilterOutlined / UnorderedListOutlined / DiffOutlined / FileSearchOutlined / TrophyOutlined / AlertOutlined / ArrowLeftOutlined / BankOutlined / LinkOutlined / PieChartOutlined / StarOutlined / WalletOutlined / SafetyCertificateOutlined / FileTextOutlined / HistoryOutlined / ProfileOutlined / ThunderboltOutlined / RocketOutlined）。
- [x] 搜索挂载点给出 A 方案具体集成点（Header + 现有 ⌘K 处理器自动复用 `data-search-input`）。
- [x] 响应式与体验设计语言 §4 断点/触控/安全区一致。
- [x] Ticket 列表标注文件、依赖、拍板项；明确不做清单。
- [x] 全程未修改 `src/` 任何文件，仅产出本 markdown。

---

*— 文档结束 · 由 UI/UX 专家（Mimo）产出，供 D7 前端现代化导航 IA 评审使用。*
