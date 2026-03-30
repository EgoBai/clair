/**
 * 应用入口 v1.5
 * 集成：路由、主题、快捷键、状态管理、代码分割
 */

import React, { useRef, useCallback, useState, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from './components/Layout/AppLayout';
import ThemeProvider from './components/Common/ThemeProvider';
import HomePage from './pages/HomePage';
import { useKeyboardShortcuts, useShortcutHints } from './hooks/useKeyboardShortcuts';
import { useAppStore } from './store/useAppStore';
import { Modal, Typography } from 'antd';
import Onboarding from './components/Common/Onboarding';
import { initWebVitals } from './utils/webVitals';
import './App.css';

// 初始化 Web Vitals 监控
initWebVitals();

const { Text } = Typography;

// 懒加载页面组件 - 减小首屏bundle
const StockListPage = lazy(() => import('./pages/StockListPage'));
const StockDetailPage = lazy(() => import('./pages/StockDetailPage'));
const MarketAnalysisPage = lazy(() => import('./pages/MarketAnalysisPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
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
const MarketHeatDashboard = lazy(() => import('./pages/MarketHeatDashboard'));

// Loading fallback
const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <Spin size="large" tip="页面加载中..." />
  </div>
);

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
      <BrowserRouter>
        <GlobalShortcuts>
          <Onboarding />
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="stocks" element={<Suspense fallback={<PageLoader />}><StockListPage /></Suspense>} />
              <Route path="stock/:symbol" element={<Suspense fallback={<PageLoader />}><StockDetailPage /></Suspense>} />
              <Route path="market" element={<Suspense fallback={<PageLoader />}><MarketAnalysisPage /></Suspense>} />
              <Route path="watchlist" element={<Suspense fallback={<PageLoader />}><WatchlistPage /></Suspense>} />
              <Route path="alerts" element={<Suspense fallback={<PageLoader />}><AlertsPage /></Suspense>} />
              <Route path="screener" element={<Suspense fallback={<PageLoader />}><ScreenerPage /></Suspense>} />
              <Route path="advanced-screener" element={<Suspense fallback={<PageLoader />}><AdvancedScreenerPage /></Suspense>} />
              <Route path="backtest" element={<Suspense fallback={<PageLoader />}><BacktestPage /></Suspense>} />
              <Route path="portfolio" element={<Suspense fallback={<PageLoader />}><PortfolioPage /></Suspense>} />
              <Route path="news" element={<Suspense fallback={<PageLoader />}><NewsPage /></Suspense>} />
              <Route path="social" element={<Suspense fallback={<PageLoader />}><SocialPage /></Suspense>} />
              <Route path="social/:symbol" element={<Suspense fallback={<PageLoader />}><SocialPage /></Suspense>} />
              <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
              <Route path="financials/:symbol" element={<Suspense fallback={<PageLoader />}><FinancialsPage /></Suspense>} />
              <Route path="financials" element={<Suspense fallback={<PageLoader />}><FinancialsPage /></Suspense>} />
              <Route path="compare" element={<Suspense fallback={<PageLoader />}><StockComparePage /></Suspense>} />
              <Route path="sectors" element={<Suspense fallback={<PageLoader />}><SectorDetailPage /></Suspense>} />
              <Route path="sectors/:code" element={<Suspense fallback={<PageLoader />}><SectorDetailPage /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<PageLoader />}><UserSettingsPage /></Suspense>} />
              <Route path="performance" element={<Suspense fallback={<PageLoader />}><PerformanceDashboardPage /></Suspense>} />
              <Route path="margin" element={<Suspense fallback={<PageLoader />}><MarginTradingPage /></Suspense>} />
              <Route path="top-traders" element={<Suspense fallback={<PageLoader />}><TopTradersPage /></Suspense>} />
              <Route path="block-trades" element={<Suspense fallback={<PageLoader />}><BlockTradesPage /></Suspense>} />
              <Route path="shareholder-changes" element={<Suspense fallback={<PageLoader />}><ShareholderChangesPage /></Suspense>} />
              <Route path="lockup-calendar" element={<Suspense fallback={<PageLoader />}><LockupCalendarPage /></Suspense>} />
              <Route path="ai-selection" element={<Suspense fallback={<PageLoader />}><AIStockSelectionPage /></Suspense>} />
              <Route path="etf" element={<Suspense fallback={<PageLoader />}><ETFPage /></Suspense>} />
              <Route path="market-heat" element={<Suspense fallback={<PageLoader />}><MarketHeatDashboard /></Suspense>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </GlobalShortcuts>
      </BrowserRouter>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
