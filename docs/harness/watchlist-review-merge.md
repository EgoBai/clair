# 自选追踪 + 复盘研究 合并设计方案

> 版本: v1.0  
> 日期: 2026-07-23  
> 状态: 设计阶段  
> 关联页面: `WatchlistPage.tsx` (1578行), `ReviewPage.tsx` (1017行)  
> 总计合并后预计: ~2200行 (含提取公共组件后)

---

## 一、问题分析

### 1.1 当前状态

| 维度 | WatchlistPage | ReviewPage | 重叠度 |
|------|-------------|-----------|--------|
| 路由 | `/watchlist` | `/review` | 独立 |
| 数据源 | `astock_watchlist_v2` (localStorage) | `astock_watchlist_v2` (localStorage) | **100% 重叠** |
| 行情API | `POST /api/stocks/batch/quotes` | `POST /api/stocks/batch/quotes` | **100% 重叠** |
| 股票表格 | 有 (代码/名称/价格/涨跌幅/PE/PB/市值/换手率/信号/操作) | 有 (代码/名称/价格/涨跌幅/涨跌额/成交量/行业) | **70% 重叠** |
| 统计卡片 | 追踪总数/今日平均涨跌/异动提醒 | 自选股票数/平均涨跌/最佳表现/最差表现 | **60% 重叠** |
| AI分析 | AI追踪总结(自动+规则回退) + AI推荐发现 | AI自选股分析(手动触发) | **50% 重叠** |
| 特有功能 | 分组管理、异动提醒、策略信号标记 | 时间区间选择(7/30/90天)、涨跌分布图、回测入口 | 无重叠 |
| 自动刷新 | 30秒轮询 | 无 | 无重叠 |
| AI API | `/api/ai/watchlist-summary` + `/api/ai/chat` | `/api/ai/watchlist-summary` | **部分重叠** |
| 技术面API | 无 | `POST /api/tech/batch` | 无重叠 |

### 1.2 核心问题

1. **数据重复加载**: 同一份自选股数据在两页各自独立 fetch，浪费网络请求和计算资源
2. **表格列不一致**: WatchlistPage 有 PE/PB/市值/信号，ReviewPage 有涨跌额/成交量/行业，用户需要在两页间切换才能看到完整信息
3. **AI能力割裂**: WatchlistPage 的 AI 总结(自动)和 ReviewPage 的 AI 分析(手动)本质是同一功能的不同视角
4. **维护成本高**: 两页共 2600+ 行代码，同一数据的展示逻辑分散在两处
5. **用户体验割裂**: 用户在"追踪"和"复盘"间切换需要导航到不同URL

---

## 二、合并目标

1. **统一入口**: `/watchlist` 为唯一页面入口
2. **Tab切换**: 页面内通过 Tab 切换 [📊 自选追踪] 和 [📈 AI复盘]
3. **数据共享**: 自选股列表、行情数据、信号数据一次加载，两个 Tab 共享
4. **ReviewPage保留**: `/review` 保留但重定向到 `/watchlist?tab=review`
5. **功能无损**: 所有现有功能均保留，不降级

---

## 三、组件树设计

### 3.1 合并后组件树

```
WatchlistHubPage (新)
├── PageHeader
│   ├── Title: "追踪中心" / "复盘中心" (随 tab 切换)
│   ├── LastRefreshTime
│   └── ActionBar (刷新按钮 / 时间范围选择器)
│
├── Tabs: [📊 自选追踪] [📈 AI复盘]
│   │
│   ├── Tab 1: WatchlistTab (自选追踪)
│   │   ├── SummaryStatsRow (共享)
│   │   │   ├── StatCard: 追踪总数
│   │   │   ├── StatCard: 今日平均涨跌
│   │   │   └── StatCard: 异动提醒
│   │   │
│   │   ├── StrategySignalsPanel (策略信号概览)
│   │   ├── AlertsBanner (异动提醒横幅)
│   │   │
│   │   ├── GroupManager (分组管理栏)
│   │   │   ├── GroupTabs (分组标签)
│   │   │   ├── AddGroupButton
│   │   │   └── AddStockButton
│   │   │
│   │   ├── StockTable (共享表格组件 - Watchlist 模式)
│   │   │   └── Columns: 代码 | 名称 | 最新价 | 涨跌幅 | PE | PB | 市值 | 换手率 | 信号 | 操作
│   │   │
│   │   ├── AiSummaryCard (AI追踪总结)
│   │   └── AiRecommendationsCard (AI推荐发现)
│   │
│   └── Tab 2: ReviewTab (AI复盘)
│       ├── DateRangeSelector (时间范围选择器: 7天/30天/90天/自定义)
│       │
│       ├── SummaryStatsRow (共享)
│       │   ├── StatCard: 自选股票数
│       │   ├── StatCard: 平均区间涨跌
│       │   ├── StatCard: 最佳表现
│       │   └── StatCard: 最差表现
│       │
│       ├── StockTable (共享表格组件 - Review 模式)
│       │   └── Columns: 代码 | 名称 | 最新价 | 区间涨跌幅 | 涨跌额 | 成交量 | 行业
│       │
│       ├── DistributionChart (涨跌分布图)
│       │   ├── StockBar (排序后的涨跌柱状条)
│       │   ├── Legend (上涨/下跌/平盘 图例)
│       │   └── KeyMetricsGrid (上涨占比/平均涨幅/涨跌家数)
│       │
│       ├── AiAnalysisCard (AI复盘分析 - 手动触发)
│       └── QuickBacktestCard (快速回测入口)
│
├── AddStockModal (添加股票弹窗)
├── CreateGroupModal (创建分组弹窗)
└── MoveStockToGroupSelect (移至分组下拉)
```

### 3.2 组件提取策略

| 原位置 | 提取为 | 类型 | 说明 |
|--------|--------|------|------|
| WatchlistPage.StatCards | `SummaryStatsRow` | 共享组件 | 通过 `variant` prop 控制显示哪组统计 |
| WatchlistPage.columns / ReviewPage.columns | `StockTable` | 共享组件 | 通过 `mode='watchlist'\|'review'` 控制列配置 |
| ReviewPage.distributionBar | `DistributionChart` | 独立组件 | 从 ReviewPage 提取为纯展示组件 |
| WatchlistPage.StrategySignals | `StrategySignalsPanel` | 独立组件 | 从 WatchlistPage 提取 |
| WatchlistPage.AlertsBanner | `AlertsBanner` | 独立组件 | 从 WatchlistPage 提取 |
| WatchlistPage.GroupManager | `GroupManager` | 独立组件 | 分组标签栏 + 操作按钮 |
| ReviewPage.DateRange | `DateRangeSelector` | 独立组件 | 时间范围选择按钮组 |
| 两者 AI 卡片 | `AiAnalysisCard` | 共享组件 | 通过 `type='summary'\|'review'\|'recommend'` 控制 |

---

## 四、数据流设计

### 4.1 数据加载架构

```
┌─────────────────────────────────────────────────────┐
│                  WatchlistHubPage                     │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │          useWatchlistData()  Hook            │     │
│  │                                              │     │
│  │  初始化:                                     │     │
│  │    1. 读 localStorage 'astock_watchlist_v2' │     │
│  │    2. 解析 groups, 提取 symbols[]            │     │
│  │                                              │     │
│  │  useEffect (symbols 变化时):                  │     │
│  │    ├── fetchQuotes()         行情快照         │     │
│  │    ├── fetchAlerts()         异动数据         │     │
│  │    └── fetchSignals()        策略信号         │     │
│  │                                              │     │
│  │  useEffect (tab='review' 时):                 │     │
│  │    └── fetchTechBatch(days)  区间技术指标      │     │
│  │                                              │     │
│  │  自动刷新 (仅在 tab='watchlist'):              │     │
│  │    └── setInterval 30s → fetchQuotes          │     │
│  │                                              │     │
│  │  返回:                                        │     │
│  │    groups, quotes, alerts, signals,           │     │
│  │    rangeData, loading, refresh              │     │
│  └─────────────────────────────────────────────┘     │
│                         │                             │
│            ┌────────────┴────────────┐                │
│            ▼                         ▼                │
│   ┌───────────────┐         ┌───────────────┐        │
│   │ WatchlistTab  │         │  ReviewTab    │        │
│   │               │         │               │        │
│   │ 消费:         │         │ 消费:          │        │
│   │ - quotes      │         │ - quotes       │        │
│   │ - alerts      │         │ - rangeData    │        │
│   │ - signals     │         │ - groups       │        │
│   │ - groups      │         │               │        │
│   └───────────────┘         └───────────────┘        │
└─────────────────────────────────────────────────────┘
```

### 4.2 `useWatchlistData` Hook 接口

```typescript
// hooks/useWatchlistData.ts

interface UseWatchlistDataReturn {
  // 自选股分组数据
  groups: WatchlistGroup[];
  activeGroup: string;
  setActiveGroup: (id: string) => void;
  currentGroup: WatchlistGroup;
  symbols: string[];

  // 实时行情 (共享)
  quotes: Record<string, StockQuote>;
  quotesLoading: boolean;

  // 异动提醒 (共享)
  alerts: AlertItem[];
  alertsLoading: boolean;

  // 策略信号 (共享)
  signals: Record<string, StrategySignal>;

  // 区间技术数据 (仅 ReviewTab 消费)
  rangeData: Record<string, { changeRange: number }>;
  rangeLoading: boolean;

  // AI 数据 (页面级管理)
  aiSummary: string;
  aiSummaryLoading: boolean;
  aiRecommendations: string;
  aiRecommendationsLoading: boolean;
  aiReviewAnalysis: string;
  aiReviewAnalysisLoading: boolean;

  // 分组操作
  addStock: (symbol: string, name: string, market: string) => void;
  removeStock: (symbol: string) => void;
  moveStock: (symbol: string, direction: 'up' | 'down') => void;
  moveStockToGroup: (symbol: string, targetGroupId: string) => void;
  createGroup: (name: string) => void;
  deleteGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;

  // 手动刷新
  refresh: () => void;
  lastRefresh: Date;

  // 复盘专用
  dateRange: string;
  setDateRange: (range: string) => void;
}
```

### 4.3 数据加载时机

| 数据 | 加载触发条件 | 刷新策略 |
|------|-------------|---------|
| groups | 页面初始化 | 从 localStorage 读，修改后立即写入 |
| quotes | symbols 变化 + tab=watchlist 30s轮询 | tab切换到review时停止轮询 |
| alerts | symbols 变化 + 30s轮询 | 同上 |
| signals | symbols 变化 + 30s轮询 | 同上 |
| rangeData | tab=review 且 dateRange 变化时 | 手动刷新 |
| aiSummary | quotes 更新后自动触发 | 仅 watchlist tab |
| aiRecommendations | quotes 更新后自动触发 | 仅 watchlist tab |
| aiReviewAnalysis | 用户手动点击"开始分析" | 仅 review tab，结果缓存直到 dateRange/symbols 变化 |

---

## 五、路由变更

### 5.1 路由配置变更

**修改文件**: `frontend/src/routes/index.tsx`

```diff
- import WatchlistPage from '../pages/WatchlistPage'
- import ReviewPage from '../pages/ReviewPage'
+ import WatchlistHubPage from '../pages/WatchlistHubPage'
+ // ReviewPage 移入 _archived 或保留为重定向页

  <Routes>
-   <Route path="/watchlist" element={<WatchlistPage />} />
-   <Route path="/review" element={<ReviewPage />} />
+   <Route path="/watchlist" element={<WatchlistHubPage />} />
+   <Route path="/review" element={<Navigate to="/watchlist?tab=review" replace />} />
  </Routes>
```

### 5.2 导航菜单变更

**修改文件**: `frontend/src/components/Layout/NavigationMenu.tsx`

```diff
  {
-   id: 'watchlist',
-   label: '自选追踪',
-   path: '/watchlist',
-   icon: '⭐',
-   description: '实时行情 · 异动提醒 · AI总结 · 推荐发现'
- },
- {
-   id: 'review',
-   label: '复盘研究',
-   path: '/review',
-   icon: '📊',
-   description: '组合分析 · 策略回测 · AI复盘 · 交易诊断'
- },
+   id: 'watchlist',
+   label: '自选追踪',
+   path: '/watchlist',
+   icon: '⭐',
+   description: '实时行情 · 异动提醒 · AI复盘 · 推荐发现'
+ },
```

### 5.3 URL 参数规范

| URL | 行为 |
|-----|------|
| `/watchlist` | 默认显示"自选追踪"Tab |
| `/watchlist?tab=watchlist` | 显示"自选追踪"Tab |
| `/watchlist?tab=review` | 显示"AI复盘"Tab |
| `/review` | 301/302 重定向到 `/watchlist?tab=review` |

### 5.4 Tab 状态保持

- Tab 选择通过 URL query parameter `?tab=` 持久化
- 浏览器前进/后退时正确恢复 Tab 状态
- Tab 切换不触发数据重新加载（数据已在父级缓存）

---

## 六、验收标准

### 6.1 功能验收

| # | 验收项 | 条件 | 优先级 |
|---|--------|------|--------|
| F1 | 统一页面入口 | `/watchlist` 渲染合并后的 WatchlistHubPage | P0 |
| F2 | Tab 切换 | 两个 Tab 可正常切换，各自内容完整渲染 | P0 |
| F3 | 自选追踪Tab完整功能 | 分组管理、股票表格(含PE/PB/市值/换手/信号)、异动提醒、AI总结、AI推荐 | P0 |
| F4 | AI复盘Tab完整功能 | 时间范围选择、区间涨跌表格、涨跌分布图、AI分析按钮、回测入口 | P0 |
| F5 | 旧路由重定向 | `/review` → `/watchlist?tab=review` (HTTP 301 或客户端重定向) | P0 |
| F6 | 数据一次加载 | quotes/alerts/signals 在父组件 useEffect 加载一次，两个Tab共享 | P0 |
| F7 | 自动刷新控制 | tab=watchlist 时 30s 轮询，tab=review 时停止轮询 | P1 |
| F8 | Review时间范围 | 切换7天/30天/90天时，区间数据正确更新 | P1 |
| F9 | URL参数持久化 | 刷新页面后 Tab 状态保持；前进后退正常 | P1 |
| F10 | 空状态处理 | 无自选股时两个Tab均正确显示空状态引导 | P2 |
| F11 | 旧书签兼容 | 直接访问 `/review` 的用户正常跳转到新页面 | P2 |
| F12 | 导航菜单更新 | 侧边栏移除"复盘研究"菜单项 | P2 |

### 6.2 性能验收

| # | 验收项 | 指标 | 优先级 |
|---|--------|------|--------|
| P1 | 首次加载 | quotes/alerts/signals 合并在一个父级 useEffect 完成，不重复请求 | P0 |
| P2 | Tab切换 | 无网络请求触发，渲染时间 < 50ms | P0 |
| P3 | 自动刷新 | tab切换前停止轮询，切换回watchlist时恢复，不产生僵尸定时器 | P1 |
| P4 | 代码体积 | 合并后总代码行数 < 2200 (含提取的公共组件) | P2 |

### 6.3 兼容性验收

| # | 验收项 | 条件 | 优先级 |
|---|--------|------|--------|
| C1 | localStorage 格式 | 继续读写 `astock_watchlist_v2`，不改变数据结构 | P0 |
| C2 | API 端点 | 所有现有 API 调用保持不变 | P0 |
| C3 | 构建产物引用 | 移除的 ReviewPage 不影响其他页面的 import | P1 |
| C4 | 类型定义 | StocksRecord/StockQuote/WatchlistGroup 等接口复用 | P1 |

---

## 七、实现步骤

### 阶段一: 提取共享组件 (预计 4-6 小时)

**Step 1.1**: 创建 `useWatchlistData` Hook
- 文件: `frontend/src/hooks/useWatchlistData.ts`
- 内容: 合并 WatchlistPage 和 ReviewPage 的所有数据获取逻辑
- 输出: 统一的 data + actions 接口

**Step 1.2**: 提取 `StockTable` 组件
- 文件: `frontend/src/components/Watchlist/StockTable.tsx`
- Props: `mode: 'watchlist' | 'review'`, `quotes`, `signals`, `rangeData`, `onRowClick`, `onMoveStock`, `onRemoveStock`, `groups`
- 内容: 根据 mode 渲染不同的列配置

**Step 1.3**: 提取 `SummaryStatsRow` 组件
- 文件: `frontend/src/components/Watchlist/SummaryStatsRow.tsx`
- Props: `variant: 'watchlist' | 'review'`, `stats: WatchlistStats | ReviewStats`
- 内容: 两组统计卡片布局

**Step 1.4**: 提取 `DistributionChart` 组件
- 文件: `frontend/src/components/Watchlist/DistributionChart.tsx`
- Props: `stocks: StockRecord[]`, `stats: ReviewStats`
- 内容: 涨跌分布柱状图 + 图例 + 关键指标

**Step 1.5**: 提取其余小组件
- `AiAnalysisCard.tsx` (统一 AI 卡片，通过 type 控制)
- `DateRangeSelector.tsx`
- `StrategySignalsPanel.tsx`
- `AlertsBanner.tsx`
- `GroupManager.tsx`

### 阶段二: 创建合并页面 (预计 3-4 小时)

**Step 2.1**: 创建 `WatchlistHubPage`
- 文件: `frontend/src/pages/WatchlistHubPage.tsx`
- 引用所有提取的组件
- 使用 `useWatchlistData` hook
- 通过 `useSearchParams` 读取当前 tab

**Step 2.2**: 实现 Tab 切换逻辑
- 使用 antd `Tabs` 组件
- activeKey 绑定到 URL searchParams
- 切换 tab 时控制自动刷新的启停

**Step 2.3**: 实现共享数据流
- quotes/alerts/signals 在 hook 层统一管理
- rangeData 仅在 tab=review 时按需加载
- AI 数据按 tab 分别缓存

### 阶段三: 路由和导航更新 (预计 1-2 小时)

**Step 3.1**: 更新路由配置
- `routes/index.tsx`: WatchlistPage → WatchlistHubPage, /review → Navigate redirect
- `ROUTE_PATHS` 常量更新

**Step 3.2**: 更新导航菜单
- `NavigationMenu.tsx`: 移除 review 菜单项，合并 description

**Step 3.3**: 旧页面归档
- 将 `WatchlistPage.tsx` 和 `ReviewPage.tsx` 移入 `pages/_archived/`
- 保留 ReviewPage 作为简单的重定向组件或直接删除

### 阶段四: 测试与清理 (预计 2-3 小时)

**Step 4.1**: 功能测试
- 两个 Tab 的所有功能回归测试
- 空状态、加载态、错误态测试
- 旧路由重定向测试

**Step 4.2**: 性能验证
- Network 面板确认无重复请求
- Tab 切换性能确认
- 轮询启停确认

**Step 4.3**: 代码清理
- 清理无用的 import
- 确保构建通过
- 更新相关类型定义文件

---

## 八、风险与注意事项

### 8.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| useWatchlistData Hook 过大 | 维护困难 | 内部拆分为 useQuotes/useAlerts/useSignals 子hooks |
| Tab 切换时数据竞争 | 显示错误数据 | 使用 AbortController 取消未完成的请求 |
| 30s 轮询在 review tab 下仍在运行 | 性能浪费 | 通过 tab 状态控制 setInterval 启停 |
| 旧版 ReviewPage 有其他页面直接 import | 构建失败 | 先 grep 全局引用再移除 |

### 8.2 用户体验风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 用户习惯的 /review 路径消失 | 书签失效 | 保留重定向，添加过渡期提示 |
| Tab 切换时页面跳动 | 体验割裂 | 保持页面高度一致，Tab 内容区域固定 min-height |
| 同时显示两个 Tab 内容导致页面过长 | 滚动困难 | Tab 设计确保同一时间只渲染一个面板 |

### 8.3 兼容性风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| localStorage 结构变更 | 数据丢失 | 本次合并不改变 localStorage 数据结构 |
| API 字段变更 | 数据解析失败 | 保持现有字段兼容逻辑（latestQuote 双重取值） |

---

## 九、附录

### A. 当前文件清单

```
待修改:
  frontend/src/pages/WatchlistPage.tsx       (→ 移入 _archived)
  frontend/src/pages/ReviewPage.tsx          (→ 移入 _archived)
  frontend/src/routes/index.tsx              (路由更新)
  frontend/src/components/Layout/NavigationMenu.tsx  (菜单更新)

待创建:
  frontend/src/pages/WatchlistHubPage.tsx    (新合并页面)
  frontend/src/hooks/useWatchlistData.ts     (数据管理 Hook)
  frontend/src/components/Watchlist/StockTable.tsx
  frontend/src/components/Watchlist/SummaryStatsRow.tsx
  frontend/src/components/Watchlist/DistributionChart.tsx
  frontend/src/components/Watchlist/AiAnalysisCard.tsx
  frontend/src/components/Watchlist/DateRangeSelector.tsx
  frontend/src/components/Watchlist/StrategySignalsPanel.tsx
  frontend/src/components/Watchlist/AlertsBanner.tsx
  frontend/src/components/Watchlist/GroupManager.tsx (可选: 若逻辑足够独立)

不受影响:
  frontend/src/components/Stock/WatchlistPanel.tsx
  frontend/src/components/Stock/StockWatchlistButton.tsx
  frontend/src/components/Stock/WatchlistToggle.tsx
  frontend/src/hooks/useWatchlistSync.ts
  clair-worker/worker.js
  所有 API 端点
```

### B. 数据接口定义（供参考）

```typescript
// === 共享数据结构 ===

interface WatchlistGroup {
  id: string;
  name: string;
  stocks: WatchlistStock[];
  isDefault?: boolean;
}

interface WatchlistStock {
  symbol: string;
  name: string;
  market: string;
  sortIndex: number;
  groupId: string;
}

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  change: number;
  volume?: number;
  turnoverRate?: number;
  industry?: string;
  peRatio?: number;
  pbRatio?: number;
  marketCap?: number;
}

interface AlertItem {
  symbol: string;
  name: string;
  alerts: Array<{
    type: string;    // 'limit_move' | 'big_move' | 'volume_spike' | 'price_break'
    level: string;   // 'critical' | 'warning' | 'info'
    message: string;
  }>;
}

interface StrategySignal {
  signal: 'buy' | 'sell' | 'hold';
  score: number;
}

// === Review 专用 ===

interface StockRecord {
  key: string;
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  changeAmt: number;
  volume: number;
  industry: string;
  rangeChangePct: number | null;  // 区间涨跌幅，null 时回退到实时 changePct
}
```

### C. Tab 内容对比

| 功能区域 | Watchlist Tab | Review Tab |
|---------|--------------|------------|
| 统计卡片 | 追踪总数 / 今日平均涨跌 / 异动提醒 | 自选股票数 / 平均区间涨跌 / 最佳表现 / 最差表现 |
| 股票表格列 | 代码、名称、最新价、涨跌幅、PE、PB、市值、换手率、信号、操作 | 代码、名称、最新价、区间涨跌幅、涨跌额、成交量、行业 |
| 分组管理 | ✅ 分组标签、创建/删除/重命名/移动 | ❌ |
| 异动提醒 | ✅ 横幅展示 | ❌ |
| 策略信号 | ✅ 信号标签云 | ❌ |
| 时间范围 | ❌ (固定为当日) | ✅ 7天/30天/90天/自定义 |
| 涨跌分布图 | ❌ | ✅ 柱状条 + 关键指标 |
| AI分析 | 自动生成追踪总结 + 推荐发现 | 手动触发区间复盘分析 |
| 回测入口 | 单行内嵌按钮 | 独立卡片 + 功能说明 |
