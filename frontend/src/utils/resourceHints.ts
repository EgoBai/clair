/**
 * 资源提示管理器
 * DNS prefetch / Preconnect / Modulepreload / Prefetch
 */

// 需要预连接的外部域名
const PRECONNECT_ORIGINS = [
  'https://api.example.com',    // 主API
  'https://cdn.example.com',    // CDN
  'https://ws.example.com',     // WebSocket
];

// DNS预解析域名（低优先级）
const DNS_PREFETCH_ORIGINS = [
  'https://analytics.example.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

interface ResourceHintConfig {
  origins?: string[];
  preconnect?: boolean;
  dnsPrefetch?: boolean;
  modulePreload?: string[];
  prefetchRoutes?: string[];
}

/**
 * 添加 preconnect link
 */
export function addPreconnect(href: string): void {
  if (typeof document === 'undefined') return;
  const id = `preconnect-${href}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = href;
  link.id = id;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);

  // 同时添加 dns-prefetch 作为回退
  const dnsLink = document.createElement('link');
  dnsLink.rel = 'dns-prefetch';
  dnsLink.href = href;
  dnsLink.id = `dns-${id}`;
  document.head.appendChild(dnsLink);
}

/**
 * 添加 dns-prefetch link
 */
export function addDnsPrefetch(href: string): void {
  if (typeof document === 'undefined') return;
  const id = `dns-prefetch-${href.replace(/[^a-zA-Z0-9]/g, '-')}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.rel = 'dns-prefetch';
  link.href = href;
  link.id = id;
  document.head.appendChild(link);
}

/**
 * 添加 modulepreload link
 */
export function addModulePreload(href: string): void {
  if (typeof document === 'undefined') return;
  const id = `modulepreload-${href.replace(/[^a-zA-Z0-9]/g, '-')}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = href;
  link.id = id;
  document.head.appendChild(link);
}

/**
 * 添加 prefetch link
 */
export function addPrefetch(href: string, as: string = 'document'): void {
  if (typeof document === 'undefined') return;
  const id = `prefetch-${href.replace(/[^a-zA-Z0-9]/g, '-')}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  link.as = as;
  link.id = id;
  document.head.appendChild(link);
}

/**
 * 在浏览器空闲时执行资源提示
 */
function scheduleIdleTask(task: () => void): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(task, { timeout: 2000 });
  } else {
    setTimeout(task, 100);
  }
}

/**
 * 初始化所有资源提示
 */
export function initResourceHints(config: ResourceHintConfig = {}): void {
  const preconnectOrigins = config.origins || PRECONNECT_ORIGINS;
  const dnsOrigins = config.dnsPrefetch ? (config.origins || DNS_PREFETCH_ORIGINS) : DNS_PREFETCH_ORIGINS;

  // 高优先级：立即执行 preconnect
  if (config.preconnect !== false) {
    preconnectOrigins.forEach(origin => addPreconnect(origin));
  }

  // 低优先级：空闲时执行 dns-prefetch
  scheduleIdleTask(() => {
    dnsOrigins.forEach(origin => addDnsPrefetch(origin));
  });

  // modulepreload
  if (config.modulePreload?.length) {
    scheduleIdleTask(() => {
      config.modulePreload!.forEach(href => addModulePreload(href));
    });
  }

  // prefetch routes
  if (config.prefetchRoutes?.length) {
    scheduleIdleTask(() => {
      config.prefetchRoutes!.forEach(href => addPrefetch(href));
    });
  }
}

/**
 * 预取路由 chunk（用于 hover 预加载）
 */
export function prefetchRouteChunk(routePath: string): void {
  const routeChunkMap: Record<string, string[]> = {
    '/stocks': ['StockListPage'],
    '/watchlist': ['WatchlistPage'],
    '/dashboard': ['DashboardPage'],
    '/screener': ['ScreenerPage', 'AdvancedScreenerPage'],
    '/backtest': ['BacktestPage'],
    '/portfolio': ['PortfolioPage'],
    '/news': ['NewsPage'],
    '/alerts': ['AlertsPage'],
  };

  const chunks = routeChunkMap[routePath];
  if (!chunks) return;

  // 通过动态 import 预加载
  chunks.forEach(chunk => {
    scheduleIdleTask(() => {
      // Vite 会自动处理动态 import 的预加载
      switch (chunk) {
        case 'StockListPage':
          import('../pages/StockListPage');
          break;

          break;
        case 'WatchlistPage':
          import('../pages/WatchlistPage');
          break;
        case 'DashboardPage':
          import('../pages/DashboardPage');
          break;
        case 'ScreenerPage':
          import('../pages/ScreenerPage');
          break;
        case 'AdvancedScreenerPage':
          import('../pages/AdvancedScreenerPage');
          break;
        case 'BacktestPage':
          import('../pages/BacktestPage');
          break;
        case 'PortfolioPage':
          import('../pages/PortfolioPage');
          break;
        case 'NewsPage':
          import('../pages/NewsPage');
          break;
        case 'AlertsPage':
          import('../pages/AlertsPage');
          break;
      }
    });
  });
}

/**
 * 路由链接 hover 时预加载
 */
export function useRoutePrefetch() {
  return {
    onMouseEnter: (routePath: string) => prefetchRouteChunk(routePath),
    onFocus: (routePath: string) => prefetchRouteChunk(routePath),
  };
}

export default {
  initResourceHints,
  prefetchRouteChunk,
  useRoutePrefetch,
  addPreconnect,
  addDnsPrefetch,
  addModulePreload,
  addPrefetch,
};
