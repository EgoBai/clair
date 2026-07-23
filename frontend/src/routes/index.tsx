import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '../components/Layout/AppLayout';
import { LazyPage } from '../components/Common/LazyPage';

// 路由路径常量 / 类型 / 工具函数 — 从独立模块 re-export 以打破循环依赖
// (routes/index.tsx → AppLayout → NavigationMenu → routes/index.tsx)
// 现有从 '../routes' 导入 ROUTE_PATHS 的代码无需改动
export { ROUTE_PATHS, type RoutePath, getRoutePath } from './paths';

// ===== 核心页面 - 懒加载 =====

// 核心循环
const DiscoverPage = lazy(() => import('../pages/DiscoverPage'));
const ScreenerPage = lazy(() => import('../pages/ScreenerPage'));
const WatchlistHubPage = lazy(() => import('../pages/WatchlistHubPage'));

// 穿透页面
const StockDetailPage = lazy(() => import('../pages/StockDetailPage'));
const FinancialsPage = lazy(() => import('../pages/FinancialsPage'));
const StockListPage = lazy(() => import('../pages/StockListPage'));
const IndexDetailPage = lazy(() => import('../pages/IndexDetailPage'));
const SectorDetailPage = lazy(() => import('../pages/SectorDetailPage'));
const BacktestPage = lazy(() => import('../pages/BacktestPage'));
const StrategyTemplatesPage = lazy(() => import('../pages/StrategyTemplatesPage'));
const IndustryMapPage = lazy(() => import('../pages/IndustryMapPage'));
const RadarPage = lazy(() => import('../pages/RadarPage'));
const KnowledgeBase = lazy(() => import('../pages/KnowledgeBase'));

// 404
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

// 路由配置 — 使用 AppLayout 作为布局路由，LazyPage 包裹每个页面（含 ErrorBoundary + Suspense）
export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        {/* 核心循环 */}
        <Route index element={<LazyPage component={DiscoverPage} name="发掘" />} />
        <Route path="screener" element={<LazyPage component={ScreenerPage} name="筛选" />} />
        <Route path="watchlist" element={<LazyPage component={WatchlistHubPage} name="自选" />} />
        <Route path="review" element={<Navigate to="/watchlist?tab=review" replace />} />

        {/* /market 重定向 — 移动端导航/快捷键/预渲染引用但未定义过路由 */}
        <Route path="market" element={<Navigate to="/" replace />} />

        {/* 穿透页面 */}
        <Route path="stocks" element={<LazyPage component={StockListPage} name="股票列表" />} />
        <Route path="stocks/:symbol" element={<LazyPage component={StockDetailPage} name="股票详情" />} />
        <Route path="financials/:symbol" element={<LazyPage component={FinancialsPage} name="财务三表" />} />
        <Route path="index/:symbol" element={<LazyPage component={IndexDetailPage} name="指数详情" />} />
        <Route path="sectors/:symbol" element={<LazyPage component={SectorDetailPage} name="板块详情" />} />
        <Route path="backtest" element={<LazyPage component={BacktestPage} name="回测" />} />
        <Route path="industry-map" element={<LazyPage component={IndustryMapPage} name="产业地图" />} />
        <Route path="radar" element={<LazyPage component={RadarPage} name="潜力雷达" />} />

        <Route path="knowledge" element={<LazyPage component={KnowledgeBase} name="投资笔记" />} />
        <Route path="strategies" element={<LazyPage component={StrategyTemplatesPage} name="策略模板" />} />

        {/* 重定向 */}
        <Route path="home" element={<Navigate to="/" replace />} />
        <Route path="index" element={<Navigate to="/" replace />} />

        {/* 404 */}
        <Route path="*" element={<LazyPage component={NotFoundPage} name="404" />} />
      </Route>
    </Routes>
  );
};

