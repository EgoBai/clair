import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '../components/Layout/AppLayout';
import { SafePage } from '../components/ErrorBoundary';

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

// Sprint 1 激活页（自 _archived/ 恢复）
const StockComparePage = lazy(() => import('../pages/StockComparePage'));
const LockupCalendarPage = lazy(() => import('../pages/LockupCalendarPage'));
const TopTradersPage = lazy(() => import('../pages/TopTradersPage'));
const MarginTradingPage = lazy(() => import('../pages/MarginTradingPage'));
const PortfolioPage = lazy(() => import('../pages/PortfolioPage'));
// P0-ACTIVATE：大宗交易（后端 /api/block-trades 已就绪，此前前端零入口）
const BlockTradesPage = lazy(() => import('../pages/BlockTradesPage'));

// Sprint 2 整合页
const MacroPage = lazy(() => import('../pages/MacroPage'));
const EventCalendarPage = lazy(() => import('../pages/EventCalendarPage'));
const RiskCenterPage = lazy(() => import('../pages/RiskCenterPage'));

// Sprint 3 AI深化
const ReportCenterPage = lazy(() => import('../pages/ReportCenterPage'));

// Sprint 4 资金面与回测
const NorthBoundPage = lazy(() => import('../pages/NorthBoundPage'));
const FactorLabPage = lazy(() => import('../pages/FactorLabPage'));

// Sprint 5 多资产
const HKConnectPage = lazy(() => import('../pages/HKConnectPage'));
const ETFPage = lazy(() => import('../pages/ETFPage'));

// Sprint 6 战略重构：D4 资金流 + P2 游戏化
const FundFlowPage = lazy(() => import('../pages/FundFlowPage'));
const JourneyPage = lazy(() => import('../pages/JourneyPage'));

// #1 聚合：宏观/资金全景入口（做减法 — 收束辅助模块，守住核心循环）
const MacroHubPage = lazy(() => import('../pages/MacroHubPage'));

// 404
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

// 路由配置 — 使用 AppLayout 作为布局路由，SafePage 包裹每个页面（含 ErrorBoundary + Suspense）
export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        {/* 核心循环 */}
        <Route index element={<SafePage component={DiscoverPage} name="发掘" />} />
        <Route path="screener" element={<SafePage component={ScreenerPage} name="筛选" />} />
        <Route path="watchlist" element={<SafePage component={WatchlistHubPage} name="自选" />} />
        <Route path="review" element={<Navigate to="/watchlist?tab=review" replace />} />

        {/* /market 重定向 — 移动端导航/快捷键/预渲染引用但未定义过路由 */}
        <Route path="market" element={<Navigate to="/" replace />} />

        {/* 穿透页面 */}
        <Route path="stocks" element={<SafePage component={StockListPage} name="股票列表" />} />
        <Route path="stocks/:symbol" element={<SafePage component={StockDetailPage} name="股票详情" />} />
        <Route path="financials/:symbol" element={<SafePage component={FinancialsPage} name="财务三表" />} />
        <Route path="index/:symbol" element={<SafePage component={IndexDetailPage} name="指数详情" />} />
        <Route path="sectors/:symbol" element={<SafePage component={SectorDetailPage} name="板块详情" />} />
        <Route path="backtest" element={<SafePage component={BacktestPage} name="回测" />} />
        <Route path="industry-map" element={<SafePage component={IndustryMapPage} name="产业地图" />} />
        <Route path="radar" element={<SafePage component={RadarPage} name="潜力雷达" />} />

        {/* Sprint 1 激活页 */}
        <Route path="compare" element={<SafePage component={StockComparePage} name="同业对比" />} />
        <Route path="lockup-calendar" element={<SafePage component={LockupCalendarPage} name="解禁日历" />} />
        <Route path="top-traders" element={<SafePage component={TopTradersPage} name="龙虎榜" />} />
        <Route path="margin-trading" element={<SafePage component={MarginTradingPage} name="融资融券" />} />
        <Route path="portfolio" element={<SafePage component={PortfolioPage} name="投资组合" />} />

        {/* Sprint 2 整合页 */}
        <Route path="macro" element={<SafePage component={MacroPage} name="宏观仪表盘" />} />
        <Route path="event-calendar" element={<SafePage component={EventCalendarPage} name="事件日历" />} />
        <Route path="risk-center" element={<SafePage component={RiskCenterPage} name="组合风控中心" />} />

        {/* Sprint 3 AI深化 */}
        <Route path="report-center" element={<SafePage component={ReportCenterPage} name="研报AI摘要中心" />} />

        {/* Sprint 4 资金面与回测 */}
        <Route path="north-bound" element={<SafePage component={NorthBoundPage} name="北向资金" />} />
        <Route path="factor-lab" element={<SafePage component={FactorLabPage} name="多因子实验室" />} />

        {/* Sprint 5 多资产 */}
        <Route path="hk-connect" element={<SafePage component={HKConnectPage} name="港股通" />} />
        <Route path="etf" element={<SafePage component={ETFPage} name="ETF中心" />} />

        {/* Sprint 6 战略重构：D4 资金流 + P2 游戏化 */}
        <Route path="fund-flow" element={<SafePage component={FundFlowPage} name="资金流向" />} />
        <Route path="macro-hub" element={<SafePage component={MacroHubPage} name="宏观资金全景" />} />
        <Route path="journey" element={<SafePage component={JourneyPage} name="成长中心" />} />

        {/* P0-ACTIVATE 大宗交易（后端已就绪，此前前端零入口） */}
        <Route path="block-trades" element={<SafePage component={BlockTradesPage} name="大宗交易" />} />

        <Route path="knowledge" element={<SafePage component={KnowledgeBase} name="投资笔记" />} />
        <Route path="strategies" element={<SafePage component={StrategyTemplatesPage} name="策略模板" />} />

        {/* 重定向 */}
        <Route path="home" element={<Navigate to="/" replace />} />
        <Route path="index" element={<Navigate to="/" replace />} />

        {/* 404 */}
        <Route path="*" element={<SafePage component={NotFoundPage} name="404" />} />
      </Route>
    </Routes>
  );
};

