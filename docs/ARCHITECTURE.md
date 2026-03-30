# 系统架构图

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         浏览器 / PWA                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    React 18 前端应用                           │  │
│  │                                                               │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │  │
│  │  │  Pages  │ │  Charts │ │ Common  │ │ Layout  │            │  │
│  │  │  14个   │ │  8个    │ │  8个    │ │         │            │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘            │  │
│  │       │           │           │           │                  │  │
│  │  ┌────┴───────────┴───────────┴───────────┴────┐            │  │
│  │  │              Hooks 层 (8个)                  │            │  │
│  │  │  useWebSocket / useKeyboardShortcuts / ...   │            │  │
│  │  └──────────────────┬──────────────────────────┘            │  │
│  │                     │                                        │  │
│  │  ┌──────────────────┴──────────────────────────┐            │  │
│  │  │         Services 层                          │            │  │
│  │  │  API Service / WebSocket / Push / Offline    │            │  │
│  │  └──────────────────┬──────────────────────────┘            │  │
│  │                     │                                        │  │
│  │  ┌──────────────────┴──────────────────────────┐            │  │
│  │  │         Store (Zustand + persist)            │            │  │
│  │  └─────────────────────────────────────────────┘            │  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────┐            │  │
│  │  │  Utils: Theme / Perf / A11y / i18n / Export │            │  │
│  │  └─────────────────────────────────────────────┘            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                          │ HTTP / WebSocket                        │
├──────────────────────────┼─────────────────────────────────────────┤
│                          │                                         │
│  ┌───────────────────────┴──────────────────────────────────────┐  │
│  │                   Express 后端服务                            │  │
│  │                                                              │  │
│  │  ┌───────────┐  ┌──────────────┐  ┌──────────────┐         │  │
│  │  │ API 层    │  │  中间件层     │  │  工具层       │         │  │
│  │  │ 15+ 路由  │  │ 安全/限流    │  │ 搜索/缓存    │         │  │
│  │  │           │  │ 验证/CSRF    │  │ 回测/AI      │         │  │
│  │  │ 股票      │  │ OWASP Top10  │  │ 复权/校验    │         │  │
│  │  │ 搜索      │  │              │  │ 指标计算     │         │  │
│  │  │ 自选股    │  │              │  │              │         │  │
│  │  │ 选股器    │  │              │  │              │         │  │
│  │  │ 回测      │  │              │  │              │         │  │
│  │  │ 组合      │  │              │  │              │         │  │
│  │  │ 新闻      │  │              │  │              │         │  │
│  │  │ AI 分析   │  │              │  │              │         │  │
│  │  │ 资金流向  │  │              │  │              │         │  │
│  │  └─────┬─────┘  └──────┬───────┘  └──────┬───────┘         │  │
│  │        │               │                 │                  │  │
│  │  ┌─────┴───────────────┴─────────────────┴──────┐          │  │
│  │  │              数据层                           │          │  │
│  │  │  Database (PostgreSQL) / WebSocket Server     │          │  │
│  │  └──────────────────────────────────────────────┘          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │                                         │
│  ┌───────────────────────┴──────────────────────────────────────┐  │
│  │  外部数据源: 新浪财经 / 腾讯财经 / 东方财富                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## 前端模块依赖图

```
main.tsx
├── ThemeProvider (主题管理)
├── BrowserRouter (路由)
├── GlobalShortcuts (快捷键)
├── Onboarding (引导教程)
├── AppLayout (布局)
│   ├── Header
│   │   ├── Search
│   │   ├── ThemeSwitcher
│   │   └── LanguageSwitcher
│   ├── Sidebar (Menu)
│   └── Content (ErrorBoundary)
│       ├── HomePage → Charts, apiService
│       ├── StockListPage → apiService, EmptyStates
│       ├── StockDetailPage → KLineChart, TimeLineChart, WebSocket
│       ├── MarketAnalysisPage → Heatmap, FundFlow
│       ├── WatchlistPage → WatchlistPanel
│       ├── AlertsPage → apiService
│       ├── ScreenerPage → apiService
│       ├── AdvancedScreenerPage → apiService
│       ├── BacktestPage → apiService, Recharts
│       ├── PortfolioPage → apiService, Recharts
│       ├── NewsPage → apiService
│       ├── SocialPage → apiService
│       └── DashboardPage → CustomDashboard
└── utils
    ├── chartTheme (主题系统)
    ├── chartPerformance (性能优化)
    ├── webVitals (性能监控)
    ├── accessibility (无障碍)
    ├── offlineMode (离线模式)
    ├── reactOptimize (React优化)
    └── i18n (国际化)
```

## 后端模块依赖图

```
app.ts
├── middleware
│   ├── securityEnhanced (OWASP安全)
│   ├── rateLimit (限流)
│   ├── validation (输入验证)
│   ├── securityHeaders (安全头)
│   └── csrf (CSRF防护)
├── api
│   ├── stock.ts → Database, search
│   ├── watchlist.ts → Database
│   ├── screener.ts → indicators
│   ├── advanced-screener.ts → indicators, dataValidation
│   ├── backtest-routes.ts → backtestEngine
│   ├── portfolio.ts → Database
│   ├── news.ts → Database
│   ├── ai-analysis.ts → aiMarketAnalysis
│   ├── fund-flow.ts → data sources
│   ├── indicators.ts → technical
│   ├── sectors.ts → Database
│   ├── social.ts → Database
│   ├── alerts.ts → Database
│   └── search.ts → search utils
├── utils
│   ├── search (搜索引擎)
│   ├── queryCache (查询缓存)
│   ├── backtestEngine (回测引擎)
│   ├── aiMarketAnalysis (AI分析)
│   ├── exRights (复权引擎)
│   ├── dataValidation (数据校验)
│   └── tokenManager (令牌管理)
├── db
│   └── Database (PostgreSQL连接池)
├── websocket
│   └── server (实时推送)
└── indicators
    └── technical (MA/EMA/MACD/KDJ/RSI/BOLL)
```

## 数据流

```
用户操作 → 前端组件
    ↓
Hooks (useWebSocket, useAsyncData)
    ↓
Services (api.ts, websocket.ts)
    ↓
HTTP/WS 请求
    ↓
后端中间件 (安全 → 限流 → 验证)
    ↓
路由处理 → 工具函数
    ↓
数据库/外部API
    ↓
响应 → 前端 Store (Zustand)
    ↓
组件重新渲染 → 用户看到更新
```

## 实时数据流

```
外部数据源 → DataCollector → 后端 WebSocket Server
                                    ↓
                            广播到已订阅的客户端
                                    ↓
前端 WebSocket Service → useWebSocket Hook
                                    ↓
                            Zustand Store 更新
                                    ↓
                        K线图/分时图/行情卡片 更新
```
