/**
 * 应用入口 v2.0
 * 核心循环：发掘 → 筛选 → 自选 → 复盘
 *
 * 生产环境API代理：将所有 /api/ 请求重定向到后端
 *
 * ==================== 后端地址：单一真源（P0-CONFIG） ====================
 * 历史上VITE_API_BASE 的默认值被写在**两处**且必须手工同步：
 *   1) 本文件的 fallback  'https://clair-api.pages.dev'
 *   2) .github/workflows/deploy.yml 的 `vars.VITE_API_BASE || 'https://clair-api.pages.dev'`
 * 两处只要漏改一处就**不报错**，而是静默指向错误的后端——而后端换域名/换平台时
 * 正是最容易漏改的场景。现改为：**代码里不再有任何默认地址**，真源唯一就是
 * 构建时注入的 VITE_API_BASE（来源见 .env.example）。
 *
 * 漏配时的行为是「快速失败」而不是「猜一个地址」。两道防线：
 *   1) 构建期：缺失时下面的 `import()` 指向一个不存在的模块。Vite/rolldown 在
 *      建图阶段解析动态 import 会报 UNRESOLVED_IMPORT 并**以非 0 退出**，
 *      于是「漏配」从「线上静默用错后端」变成「CI 当场构建失败」。
 *      （已实测：单纯 `throw` 是**无效**的——构建期不执行模块顶层代码。）
 *   2) 运行期：万一产物被绕过构建期检查（例如手工拼装），页面立刻显示
 *      可读错误横幅并抛错中断启动，且**绝不安装 fetch 重定向**，
 *      不会向任何一个未知后端发请求。
 */

/** 构建期注入的后端地址。**刻意没有默认值**——这正是本段代码存在的全部意义。 */
const RAW_API_BASE = import.meta.env.VITE_API_BASE || '';
const isDev = import.meta.env.DEV;
if (!isDev && !RAW_API_BASE.trim()) {
  const message =
    '[config] 生产构建缺少 VITE_API_BASE，已中止启动。\n' +
    '  线上前端必须显式指定后端地址，不要依赖代码里的默认兜底。\n' +
    '  注入方式：构建时设置环境变量 VITE_API_BASE=https://<你的后端域名>\n' +
    '  变量清单与缺失后果见仓库根目录 .env.example。';

  // 先把错误画到页面上：terser 生产构建会 drop console.*，
  // 抛出的异常只会进浏览器控制台，页面本身必须自带可读提示。
  if (typeof document !== 'undefined') {
    const root = document.getElementById('root');
    if (root) {
      const box = document.createElement('div');
      box.setAttribute('data-config-error', 'VITE_API_BASE');
      box.style.cssText =
        'margin:48px auto;max-width:720px;padding:24px;border:1px solid #d4380d;' +
        'border-radius:8px;background:#fff7e6;color:#a8071a;' +
        'font:14px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;';
      box.textContent = message;
      root.replaceChildren(box);
    }
  }
  // ---- 构建期防线：让漏配真正变成一次构建失败 ----
  // 下面这行只在「生产构建且未注入 VITE_API_BASE」时才可达：条件里的
  // import.meta.env 被 Vite 静态替换为常量后，整个分支被常量折叠 + DCE 掉，
  // 因此**配置正确时它根本不会进入构建图**（实测：配置正确→ 构建成功 exit 0）。
  // 一旦漏配，它在 rolldown 建图阶段触发 UNRESOLVED_IMPORT，使构建非 0 退出。
  // 模块名刻意写成一句可读的报错，让 CI 日志直接能看懂缺什么。
  //
  // 两个必须保留的实现细节（均已实测，改动前请重测）：
  //  1) **不能加 @vite-ignore** —— 加了之后 rolldown 跳过解析，构建照样成功，
  //     防线直接失效（实测 exit 0）。
  //  2) **必须是顶层 await** —— 写成 `void import(...)` 时分支不会被 DCE，
  //     即便配置正确也会构建失败（实测 exit 1）。
  //
  // 这里的 @ts-ignore 只为压制 tsc 的 TS2307（模块故意不存在）。
  // deploy.yml 的构建命令是 `npx tsc && npx vite build`——tsc 先跑，
  // 若不压制，**配置完全正确**时也会因 TS2307 让整条流水线失败，
  // 那就变成了「永远部署不出去」而不是「漏配时失败」。
  // @ts-ignore
  await import(
    './VITE_API_BASE 未注入：生产构建必须显式指定后端地址，见 .env.example'
  );

  throw new Error(message);
}

/** 归一化后的后端地址：去掉尾部斜杠，避免拼接 `/api/...` 时出现 `//api/`。 */
const API_BASE = RAW_API_BASE.trim().replace(/\/+$/, '');

if (typeof window !== 'undefined' && !isDev) {
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
