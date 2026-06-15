/**
 * 应用入口 v2.0
 * 核心循环：发掘 → 筛选 → 自选 → 复盘
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

import React, { useRef, useCallback, useState, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Modal, Typography } from 'antd';
import AppLayout from './components/Layout/AppLayout';
import ThemeProvider from './components/Common/ThemeProvider';
import { UnifiedErrorBoundary } from './components/Common/UnifiedErrorBoundary';
import { useKeyboardShortcuts, useShortcutHints } from './hooks/useKeyboardShortcuts';
import { useAppStore } from './store/useAppStore';
import { initWebVitals } from './utils/webVitals';
import LazyPage from './components/Common/LazyPage';
import I18nProvider from './i18n';
import { analytics } from './utils/analytics';
import './App.css';
import './styles/design-system.css';
import './styles/global-dark.css';
import './styles/responsive.css';
import './styles/pages-responsive.css';
import './styles/touch-interactions.css';

// 初始化 Web Vitals 监控
initWebVitals();

const { Text } = Typography;

// ===== 核心循环页面 =====
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const ScreenerPage = lazy(() => import('./pages/ScreenerPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));

// ===== 穿透页面 =====
const StockListPage = lazy(() => import('./pages/StockListPage'));
const StockDetailPage = lazy(() => import('./pages/StockDetailPage'));
const IndexDetailPage = lazy(() => import('./pages/IndexDetailPage'));
const SectorDetailPage = lazy(() => import('./pages/SectorDetailPage'));
const BacktestPage = lazy(() => import('./pages/BacktestPage'));
const IndustryMapPage = lazy(() => import('./pages/IndustryMapPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// ==================== 全局快捷键包装器 ====================

function GlobalShortcuts({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [showHints, setShowHints] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const { setTheme, preferences } = useAppStore();

  const handleSearchFocus = useCallback(() => {
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

// ==================== 页面访问追踪组件 ====================

function PageViewTracker() {
  const location = useLocation();
  
  useEffect(() => {
    // 追踪页面访问
    analytics.trackPageView(location.pathname, document.title);
  }, [location.pathname]);
  
  return null;
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
        <PageViewTracker />
        <GlobalShortcuts>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              {/* 核心循环 */}
              <Route index element={<LazyPage component={DiscoverPage} name="发掘" />} />
              <Route path="screener" element={<LazyPage component={ScreenerPage} name="筛选" />} />
              <Route path="watchlist" element={<LazyPage component={WatchlistPage} name="自选" />} />
              <Route path="review" element={<LazyPage component={ReviewPage} name="复盘" />} />

              {/* 穿透页面 */}
              <Route path="stocks" element={<LazyPage component={StockListPage} name="股票列表" />} />
              <Route path="stocks/:symbol" element={<LazyPage component={StockDetailPage} name="股票详情" />} />
              <Route path="index/:symbol" element={<LazyPage component={IndexDetailPage} name="指数详情" />} />
              <Route path="sectors/:code" element={<LazyPage component={SectorDetailPage} name="板块详情" />} />
              <Route path="backtest" element={<LazyPage component={BacktestPage} name="回测" />} />
              <Route path="industry-map" element={<LazyPage component={IndustryMapPage} name="产业地图" />} />

              {/* 404 */}
              <Route path="*" element={<LazyPage component={NotFoundPage} name="404" />} />
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
