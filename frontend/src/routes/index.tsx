import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// ===== 页面组件 - 使用懒加载 =====

// 核心页面
const HomePage = lazy(() => import('../pages/HomePage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

// 股票相关
const StockListPage = lazy(() => import('../pages/StockListPage'));
const StockDetailPage = lazy(() => import('../pages/StockDetailPage'));
const StockComparePage = lazy(() => import('../pages/StockComparePage'));

// 市场分析
const MarketAnalysisPage = lazy(() => import('../pages/MarketAnalysisPage'));
const MarketStatsPage = lazy(() => import('../pages/MarketStatsPage'));
const MarketHeatDashboard = lazy(() => import('../pages/MarketHeatDashboard'));

// 行业板块
const SectorDetailPage = lazy(() => import('../pages/SectorDetailPage'));

// 发掘
const DiscoverPage = lazy(() => import('../pages/DiscoverPage'));

// 自选股 & 筛选
const WatchlistPage = lazy(() => import('../pages/WatchlistPage'));
const ScreenerPage = lazy(() => import('../pages/ScreenerPage'));
const AdvancedScreenerPage = lazy(() => import('../pages/AdvancedScreenerPage'));

// 交易 & 投资
const PortfolioPage = lazy(() => import('../pages/PortfolioPage'));
const BacktestPage = lazy(() => import('../pages/BacktestPage'));
const BlockTradesPage = lazy(() => import('../pages/BlockTradesPage'));
const MarginTradingPage = lazy(() => import('../pages/MarginTradingPage'));
const ETFPage = lazy(() => import('../pages/ETFPage'));

// 财务 & 资讯
const FinancialsPage = lazy(() => import('../pages/FinancialsPage'));
const NewsPage = lazy(() => import('../pages/NewsPage'));
const SocialPage = lazy(() => import('../pages/SocialPage'));

// 高级功能
const AIStockSelectionPage = lazy(() => import('../pages/AIStockSelectionPage'));
const TopTradersPage = lazy(() => import('../pages/TopTradersPage'));
const LockupCalendarPage = lazy(() => import('../pages/LockupCalendarPage'));
const ShareholderChangesPage = lazy(() => import('../pages/ShareholderChangesPage'));

// 仪表板 & 性能
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const PerformanceDashboardPage = lazy(() => import('../pages/PerformanceDashboardPage'));
const PerformanceDemoPage = lazy(() => import('../pages/PerformanceDemoPage'));

// 设置 & 提醒
const AlertsPage = lazy(() => import('../pages/AlertsPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const UserSettingsPage = lazy(() => import('../pages/UserSettingsPage'));

// 加载中组件
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
    fontSize: '1.2rem',
    color: '#666'
  }}>
    ⏳ 加载中...
  </div>
);

// 路由配置
export const AppRoutes = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* 首页 */}
        <Route path="/" element={<HomePage />} />

        {/* 股票相关页面 */}
        <Route path="/stocks" element={<StockListPage />} />
        <Route path="/stocks/:symbol" element={<StockDetailPage />} />
        <Route path="/stocks/compare" element={<StockComparePage />} />

        {/* 市场分析 */}
        <Route path="/market" element={<MarketAnalysisPage />} />
        <Route path="/market/analysis" element={<MarketAnalysisPage />} />
        <Route path="/market/stats" element={<MarketStatsPage />} />
        <Route path="/market/heatmap" element={<MarketHeatDashboard />} />

        {/* 行业板块 */}
        <Route path="/sectors/:symbol" element={<SectorDetailPage />} />

        {/* 发掘 */}
        <Route path="/discover" element={<DiscoverPage />} />

        {/* 自选股 & 筛选 */}
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/screener" element={<ScreenerPage />} />
        <Route path="/screener/advanced" element={<AdvancedScreenerPage />} />

        {/* 交易 & 投资 */}
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/block-trades" element={<BlockTradesPage />} />
        <Route path="/margin" element={<MarginTradingPage />} />
        <Route path="/etf" element={<ETFPage />} />

        {/* 财务 & 资讯 */}
        <Route path="/financials/:symbol" element={<FinancialsPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/social/:symbol" element={<SocialPage />} />

        {/* 高级功能 */}
        <Route path="/ai-selection" element={<AIStockSelectionPage />} />
        <Route path="/top-traders" element={<TopTradersPage />} />
        <Route path="/lockup-calendar" element={<LockupCalendarPage />} />
        <Route path="/shareholder-changes" element={<ShareholderChangesPage />} />

        {/* 仪表板 & 性能 */}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/performance" element={<PerformanceDashboardPage />} />
        <Route path="/performance-demo" element={<PerformanceDemoPage />} />

        {/* 设置 & 提醒 */}
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/user-settings" element={<UserSettingsPage />} />

        {/* 重定向 */}
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/index" element={<Navigate to="/" replace />} />

        {/* 404页面 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};

// 路由路径常量
export const ROUTE_PATHS = {
  HOME: '/',
  // 股票
  STOCKS: '/stocks',
  STOCK_DETAIL: '/stocks/:symbol',
  STOCK_COMPARE: '/stocks/compare',
  // 市场
  MARKET: '/market',
  MARKET_ANALYSIS: '/market/analysis',
  MARKET_STATS: '/market/stats',
  MARKET_HEATMAP: '/market/heatmap',
  // 行业
  SECTOR_DETAIL: '/sectors/:symbol',
  // 自选股 & 筛选
  WATCHLIST: '/watchlist',
  SCREENER: '/screener',
  ADVANCED_SCREENER: '/screener/advanced',
  // 交易 & 投资
  PORTFOLIO: '/portfolio',
  BACKTEST: '/backtest',
  BLOCK_TRADES: '/block-trades',
  MARGIN: '/margin',
  ETF: '/etf',
  // 财务 & 资讯
  FINANCIALS: '/financials/:symbol',
  NEWS: '/news',
  SOCIAL: '/social/:symbol',
  // 高级功能
  AI_SELECTION: '/ai-selection',
  TOP_TRADERS: '/top-traders',
  LOCKUP_CALENDAR: '/lockup-calendar',
  SHAREHOLDER_CHANGES: '/shareholder-changes',
  // 仪表板
  DASHBOARD: '/dashboard',
  PERFORMANCE: '/performance',
  PERFORMANCE_DEMO: '/performance-demo',
  // 设置
  ALERTS: '/alerts',
  SETTINGS: '/settings',
  USER_SETTINGS: '/user-settings',
} as const;

// 路由配置类型
export type RoutePath = keyof typeof ROUTE_PATHS;

// 获取路由路径
export const getRoutePath = (route: RoutePath, params?: Record<string, string>): string => {
  let path: string = ROUTE_PATHS[route];

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      path = path.replace(`:${key}`, value);
    });
  }

  return path;
};
