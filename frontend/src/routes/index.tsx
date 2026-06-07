import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// ===== 核心页面 - 懒加载 =====

// 核心循环
const DiscoverPage = lazy(() => import('../pages/DiscoverPage'));
const ScreenerPage = lazy(() => import('../pages/ScreenerPage'));
const WatchlistPage = lazy(() => import('../pages/WatchlistPage'));
const ReviewPage = lazy(() => import('../pages/ReviewPage'));

// 穿透页面
const StockDetailPage = lazy(() => import('../pages/StockDetailPage'));
const StockListPage = lazy(() => import('../pages/StockListPage'));
const IndexDetailPage = lazy(() => import('../pages/IndexDetailPage'));
const SectorDetailPage = lazy(() => import('../pages/SectorDetailPage'));
const BacktestPage = lazy(() => import('../pages/BacktestPage'));

// 404
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

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
        {/* 核心循环 */}
        <Route path="/" element={<DiscoverPage />} />
        <Route path="/screener" element={<ScreenerPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/review" element={<ReviewPage />} />

        {/* 穿透页面 */}
        <Route path="/stocks" element={<StockListPage />} />
        <Route path="/stocks/:symbol" element={<StockDetailPage />} />
        <Route path="/index/:symbol" element={<IndexDetailPage />} />
        <Route path="/sectors/:symbol" element={<SectorDetailPage />} />
        <Route path="/backtest" element={<BacktestPage />} />

        {/* 重定向 */}
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/index" element={<Navigate to="/" replace />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};

// 路由路径常量
export const ROUTE_PATHS = {
  HOME: '/',
  // 核心循环
  SCREENER: '/screener',
  WATCHLIST: '/watchlist',
  REVIEW: '/review',
  // 穿透
  STOCKS: '/stocks',
  STOCK_DETAIL: '/stocks/:symbol',
  BACKTEST: '/backtest',
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
