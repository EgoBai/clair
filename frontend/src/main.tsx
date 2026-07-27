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

import React, { useRef, useCallback, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom';
import { Modal, Typography } from 'antd';
import ThemeProvider from './components/Common/ThemeProvider';
import { UnifiedErrorBoundary } from './components/Common/UnifiedErrorBoundary';
import { useKeyboardShortcuts, useShortcutHints } from './hooks/useKeyboardShortcuts';
import { useAppStore } from './store/useAppStore';
import { initWebVitals } from './utils/webVitals';
import I18nProvider from './i18n';
import { analytics } from './utils/analytics';
import { AppRoutes } from './routes';
import './App.css';
import './styles/design-system.css';
import './styles/global-dark.css';
import './styles/responsive.css';
import './styles/pages-responsive.css';
import './styles/touch-interactions.css';

// 初始化 Web Vitals 监控
initWebVitals();

const { Text } = Typography;

// ==================== 全局快捷键包装器 ====================

function GlobalShortcuts({ children }: { children: React.ReactNode }) {
  const _navigate = useNavigate();
  const [showHints, setShowHints] = useState(false);
  const _searchRef = useRef<HTMLInputElement | null>(null);
  // T4 粒度优化：细粒度选择器替代全 store 解构，避免任意状态变化重渲染整个路由子树
  const setTheme = useAppStore((s) => s.setTheme);
  const currentTheme = useAppStore((s) => s.preferences.theme);

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
    const currentIdx = themes.indexOf(currentTheme);
    const nextTheme = themes[(currentIdx + 1) % themes.length];
    setTheme(nextTheme);
  }, [currentTheme, setTheme]);

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
          <AppRoutes />
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

// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // SW registration failed, continue without offline support
    });
  });
}
