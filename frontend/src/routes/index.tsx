import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// ===== 核心页面 - 懒加载 =====

// 核心循环
const DiscoverPage = lazy(() => import('../pages/DiscoverPage'));
const ScreenerPage = lazy(() => import('../pages/ScreenerPage'));
const WatchlistHubPage = lazy(() => import('../pages/WatchlistHubPage'));

// 穿透页面
const StockDetailPage = lazy(() => import('../pages/StockDetailPage'));
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

// 加载中组件 — 使用 Skeleton 骨架屏，避免空白 Spin
const LoadingFallback = () => (
  <div style={{
    maxWidth: 1200,
    margin: '0 auto',
    padding: '40px 24px',
    minHeight: '100vh',
    background: '#0f172a',
  }}>
    {/* 标题骨架 */}
    <div style={{ marginBottom: 32 }}>
      <div style={{
        width: 200, height: 28, borderRadius: 6,
        background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s infinite',
      }} />
      <div style={{
        width: 340, height: 16, borderRadius: 4, marginTop: 10,
        background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s infinite',
      }} />
    </div>

    {/* 顶部宽卡片骨架 */}
    <div style={{
      borderRadius: 12, padding: '28px 32px', marginBottom: 24,
      background: '#1e293b', border: '1px solid #334155',
    }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
          backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
        }} />
        <div style={{ flex: 1 }}>
          <div style={{
            width: 180, height: 22, borderRadius: 4, marginBottom: 6,
            background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
            backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
          }} />
          <div style={{
            width: 260, height: 14, borderRadius: 4,
            background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
            backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
          }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{
              width: i === 0 ? '60%' : '45%', height: 18, borderRadius: 4, marginBottom: 12,
              background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
              backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
            }} />
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} style={{
                width: `${85 + Math.random() * 10}%`, height: 14, borderRadius: 4, marginBottom: 8,
                background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
              }} />
            ))}
          </div>
        ))}
      </div>
    </div>

    {/* 板块卡片骨架 */}
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} style={{
        borderRadius: 10, padding: '12px 16px', marginBottom: 8,
        background: '#1e293b', border: '1px solid #334155',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 50, height: 50, borderRadius: 8,
          background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
          backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
        }} />
        <div style={{ flex: 1 }}>
          <div style={{
            width: 140, height: 16, borderRadius: 4, marginBottom: 6,
            background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
            backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
          }} />
          <div style={{
            width: 280, height: 12, borderRadius: 4,
            background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
            backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
          }} />
        </div>
      </div>
    ))}

    {/* shimmer 动画定义 */}
    <style>{`
      @keyframes skeleton-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
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
        <Route path="/watchlist" element={<WatchlistHubPage />} />
        {/* /review 重定向到 /watchlist?tab=review */}
        <Route path="/review" element={<Navigate to="/watchlist?tab=review" replace />} />

        {/* 穿透页面 */}
        <Route path="/stocks" element={<StockListPage />} />
        <Route path="/stocks/:symbol" element={<StockDetailPage />} />
        <Route path="/index/:symbol" element={<IndexDetailPage />} />
        <Route path="/sectors/:symbol" element={<SectorDetailPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/strategies" element={<StrategyTemplatesPage />} />
        <Route path="/industry-map" element={<IndustryMapPage />} />
        <Route path="/radar" element={<RadarPage />} />
        <Route path="/knowledge" element={<KnowledgeBase />} />

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
  STRATEGIES: '/strategies',
  INDUSTRY_MAP: '/industry-map',
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
