/**
 * 应用入口 v1.5
 * 集成：路由、主题、快捷键、状态管理、代码分割
 * 
 * 生产环境API代理：将所有 /api/ 请求重定向到后端
 */
if (typeof window !== 'undefined' && !import.meta.env.DEV) {
  const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE)
    || 'https://clair-api.pages.dev';
  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    let url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
    if (url.startsWith('/api/')) {
      url = API_BASE + url;
    }
    if (typeof input === 'string') {
      return originalFetch(url, init);
    }
    return originalFetch(new Request(url, input as RequestInit), init);
  } as typeof fetch;
}

import React, { useRef, useCallback, useState, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Modal, Typography } from 'antd';
import AppLayout from './components/Layout/AppLayout';
import ThemeProvider from './components/Common/ThemeProvider';
import { UnifiedErrorBoundary } from './components/Common/UnifiedErrorBoundary';
import { useKeyboardShortcuts, useShortcutHints } from './hooks/useKeyboardShortcuts';
import { useAppStore } from './store/useAppStore';
import Onboarding from './components/Common/Onboarding';
import { initWebVitals } from './utils/webVitals';
import LazyPage from './components/Common/LazyPage';
import I18nProvider from './i18n';
import './App.css';

// 初始化 Web Vitals 监控
initWebVitals();

const { Text } = Typography;

// 懒加载页面组件 - 减小首屏bundle
const StockListPage = lazy(() => import('./pages/StockListPage'));
const StockDetailPage = lazy(() => import('./pages/StockDetailPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const ScreenerPage = lazy(() => import('./pages/ScreenerPage'));
const AdvancedScreenerPage = lazy(() => import('./pages/AdvancedScreenerPage'));
const BacktestPage = lazy(() => import('./pages/BacktestPage'));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const SocialPage = lazy(() => import('./pages/SocialPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const FinancialsPage = lazy(() => import('./pages/FinancialsPage'));
const StockComparePage = lazy(() => import('./pages/StockComparePage'));
const SectorDetailPage = lazy(() => import('./pages/SectorDetailPage'));
const UserSettingsPage = lazy(() => import('./pages/UserSettingsPage'));
const PerformanceDashboardPage = lazy(() => import('./pages/PerformanceDashboardPage'));
const MarginTradingPage = lazy(() => import('./pages/MarginTradingPage'));
const TopTradersPage = lazy(() => import('./pages/TopTradersPage'));
const BlockTradesPage = lazy(() => import('./pages/BlockTradesPage'));
const ShareholderChangesPage = lazy(() => import('./pages/ShareholderChangesPage'));
const LockupCalendarPage = lazy(() => import('./pages/LockupCalendarPage'));
const AIStockSelectionPage = lazy(() => import('./pages/AIStockSelectionPage'));
const ETFPage = lazy(() => import('./pages/ETFPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const IndexDetailPage = lazy(() => import('./pages/IndexDetailPage'));
const MarketStatsPage = lazy(() => import('./pages/MarketStatsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// ==================== 全局快捷键包装器 ====================

function GlobalShortcuts({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [showHints, setShowHints] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const { setTheme, preferences } = useAppStore();

  const handleSearchFocus = useCallback(() => {
    // 尝试聚焦页面搜索框
    const searchInput = document.querySelector<HTMLInputElement>(
      '.search-input input, [data-search-input], input[placeholder*="搜索"]'
    );
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }, []);

  const handleEscape = useCallback(() => {
    setShowHints(false);
  }, []);

  const handleToggleTheme = useCallback(() => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIdx = themes.indexOf(preferences.theme);
    const nextTheme = themes[(currentIdx + 1) % themes.length];
    setTheme(nextTheme);
  }, [preferences.theme, setTheme]);

  useKeyboardShortcuts({
    onSearchFocus: handleSearchFocus,
    onEscape: handleEscape,
    onToggleTheme: handleToggleTheme,
  });

  const hints = useShortcutHints();

  return (
    <>
      {children}
      {/* 快捷键提示面板 */}
      <Modal
        title="键盘快捷键"
        open={showHints}
        onCancel={() => setShowHints(false)}
        footer={null}
        width={360}
      >
        {hints.map((h, i) => (
          <div key={i} className="shortcut-hint-row">
            <Text>{h.description}</Text>
            <div className="shortcut-keys">
              {h.keys.map((k, j) => (
                <span key={j} className="shortcut-key">{k}</span>
              ))}
            </div>
          </div>
        ))}
      </Modal>
    </>
  );
}

// ==================== 404 页面 ====================

function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      color: '#999',
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>404</div>
      <div style={{ fontSize: 18 }}>页面不存在</div>
      <a href="/" style={{ marginTop: 16, color: '#3B82F6' }}>返回首页</a>
    </div>
  );
}

// ==================== 应用根组件 ====================

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL} future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}>
        <GlobalShortcuts>
          {/* <Onboarding /> */}
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<LazyPage component={DiscoverPage} name="发掘" />} />
              <Route path="stocks" element={<LazyPage component={StockListPage} name="股票列表" />} />
              <Route path="stocks/:symbol" element={<LazyPage component={StockDetailPage} name="股票详情" />} />
              <Route path="watchlist" element={<LazyPage component={WatchlistPage} name="自选股" />} />
              <Route path="discover" element={<LazyPage component={DiscoverPage} name="发掘" />} />
              <Route path="alerts" element={<LazyPage component={AlertsPage} name="预警" />} />
              <Route path="screener" element={<LazyPage component={ScreenerPage} name="选股器" />} />
              <Route path="advanced-screener" element={<LazyPage component={AdvancedScreenerPage} name="高级选股" />} />
              <Route path="backtest" element={<LazyPage component={BacktestPage} name="回测" />} />
              <Route path="review" element={<LazyPage component={ReviewPage} name="复盘" />} />
              <Route path="portfolio" element={<LazyPage component={PortfolioPage} name="持仓" />} />
              <Route path="news" element={<LazyPage component={NewsPage} name="资讯" />} />
              <Route path="social" element={<LazyPage component={SocialPage} name="社区" />} />
              <Route path="social/:symbol" element={<LazyPage component={SocialPage} name="个股社区" />} />
              <Route path="dashboard" element={<LazyPage component={DashboardPage} name="仪表盘" />} />
              <Route path="financials/:symbol" element={<LazyPage component={FinancialsPage} name="财务" />} />
              <Route path="financials" element={<LazyPage component={FinancialsPage} name="财务" />} />
              <Route path="compare" element={<LazyPage component={StockComparePage} name="对比" />} />
              <Route path="sectors" element={<LazyPage component={SectorDetailPage} name="板块" />} />
              <Route path="sectors/:code" element={<LazyPage component={SectorDetailPage} name="板块详情" />} />
              <Route path="settings" element={<LazyPage component={UserSettingsPage} name="设置" />} />
              <Route path="performance" element={<LazyPage component={PerformanceDashboardPage} name="性能" />} />
              <Route path="margin" element={<LazyPage component={MarginTradingPage} name="融资融券" />} />
              <Route path="top-traders" element={<LazyPage component={TopTradersPage} name="龙虎榜" />} />
              <Route path="block-trades" element={<LazyPage component={BlockTradesPage} name="大宗交易" />} />
              <Route path="shareholder-changes" element={<LazyPage component={ShareholderChangesPage} name="股东变动" />} />
              <Route path="lockup-calendar" element={<LazyPage component={LockupCalendarPage} name="解禁日历" />} />
              <Route path="ai-selection" element={<LazyPage component={AIStockSelectionPage} name="AI选股" />} />
              <Route path="index/:symbol" element={<LazyPage component={IndexDetailPage} name="指数详情" />} />
              <Route path="etf" element={<LazyPage component={ETFPage} name="ETF" />} />

              <Route path="market-stats" element={<LazyPage component={MarketStatsPage} name="市场统计" />} />
              <Route path="*" element={<LazyPage component={NotFoundPage} name="404页面" />} />
            </Route>
          </Routes>
        </GlobalShortcuts>
      </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UnifiedErrorBoundary name="App Root" maxRetries={5}>
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif', minHeight: '100vh' }}>
        <App />
      </div>
    </UnifiedErrorBoundary>
  </React.StrictMode>,
);
