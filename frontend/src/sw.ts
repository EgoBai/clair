/// <reference lib="webworker" />

/**
 * Service Worker 缓存策略
 * 支持多种缓存策略：
 * 1. Cache First - 静态资源优先缓存
 * 2. Network First - API数据优先网络
 * 3. Stale While Revalidate - 后台更新策略
 * 4. Network Only - WebSocket等实时数据
 * 
 * 参考 Google Workbox 最佳实践
 */

const CACHE_VERSION = 'v2.0.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// 缓存大小限制
const CACHE_LIMITS = {
  [STATIC_CACHE]: 50,
  [DYNAMIC_CACHE]: 100,
  [API_CACHE]: 200,
  [IMAGE_CACHE]: 100,
};

// ==================== 静态资源列表 ====================
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
];

// ==================== 缓存策略配置 ====================
interface CacheRule {
  pattern: RegExp;
  strategy: 'cache-first' | 'network-first' | 'stale-while-revalidate' | 'network-only';
  cacheName: string;
  maxAge?: number;  // 秒
  maxEntries?: number;
}

const CACHE_RULES: CacheRule[] = [
  // 静态资源 - Cache First
  {
    pattern: /\.(js|css|woff2?|ttf|eot)$/,
    strategy: 'cache-first',
    cacheName: STATIC_CACHE,
    maxAge: 7 * 24 * 3600,
  },
  // 图片 - Cache First
  {
    pattern: /\.(png|jpg|jpeg|gif|svg|webp|ico)$/,
    strategy: 'cache-first',
    cacheName: IMAGE_CACHE,
    maxAge: 30 * 24 * 3600,
  },
  // API数据 - Network First (实时性)
  {
    pattern: /^\/api\/(stocks|quotes|market)/,
    strategy: 'network-first',
    cacheName: API_CACHE,
    maxAge: 30,
  },
  // 搜索 - Stale While Revalidate
  {
    pattern: /^\/api\/search/,
    strategy: 'stale-while-revalidate',
    cacheName: API_CACHE,
    maxAge: 60,
  },
  // 自选股/配置 - Stale While Revalidate
  {
    pattern: /^\/api\/(watchlist|alerts|portfolio)/,
    strategy: 'stale-while-revalidate',
    cacheName: API_CACHE,
    maxAge: 120,
  },
  // WebSocket - Network Only
  {
    pattern: /^\/ws/,
    strategy: 'network-only',
    cacheName: '',
  },
  // 新闻/资讯 - Network First
  {
    pattern: /^\/api\/(news|ai)/,
    strategy: 'network-first',
    cacheName: API_CACHE,
    maxAge: 300,
  },
];

// ==================== 缓存策略实现 ====================
async function cacheFirst(request: Request, cacheName: string, maxAge: number): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    const cacheDate = cached.headers.get('sw-cache-date');
    if (cacheDate) {
      const age = (Date.now() - parseInt(cacheDate, 10)) / 1000;
      if (age < maxAge) {
        return cached;
      }
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseClone = response.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cache-date', String(Date.now()));
      const cachedResponse = new Response(await responseClone.blob(), {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers,
      });
      await cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request: Request, cacheName: string, maxAge: number): Promise<Response> {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseClone = response.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cache-date', String(Date.now()));
      const cachedResponse = new Response(await responseClone.blob(), {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers,
      });
      await cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const cacheDate = cached.headers.get('sw-cache-date');
      if (cacheDate) {
        const age = (Date.now() - parseInt(cacheDate, 10)) / 1000;
        if (age < maxAge * 10) { // 离线允许更长缓存
          return cached;
        }
      }
      return cached;
    }
    return new Response(JSON.stringify({ success: false, error: '离线状态' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(
  request: Request,
  cacheName: string,
  maxAge: number
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        const responseClone = response.clone();
        const headers = new Headers(responseClone.headers);
        headers.set('sw-cache-date', String(Date.now()));
        const cachedResponse = new Response(responseClone.body, {
          status: responseClone.status,
          statusText: responseClone.statusText,
          headers,
        });
        cache.put(request, cachedResponse);
      }
      return response;
    })
    .catch(() => cached);

  if (cached) {
    const cacheDate = cached.headers.get('sw-cache-date');
    if (cacheDate) {
      const age = (Date.now() - parseInt(cacheDate, 10)) / 1000;
      if (age < maxAge) {
        return cached;
      }
    }
    return cached;
  }

  return fetchPromise;
}

// ==================== 缓存管理 ====================
async function trimCache(cacheName: string, maxEntries: number): Promise<void> {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxEntries) {
    const deleteCount = keys.length - maxEntries;
    for (let i = 0; i < deleteCount; i++) {
      await cache.delete(keys[i]);
    }
  }
}

async function cleanupExpiredCache(): Promise<void> {
  const cacheNames = await caches.keys();
  for (const name of cacheNames) {
    if (!name.includes(CACHE_VERSION)) {
      await caches.delete(name);
      continue;
    }

    const cache = await caches.open(name);
    const keys = await cache.keys();
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const cacheDate = response.headers.get('sw-cache-date');
        if (cacheDate) {
          const age = (Date.now() - parseInt(cacheDate, 10)) / 1000;
          const maxAge = name.includes('static') ? 7 * 86400 : 86400;
          if (age > maxAge) {
            await cache.delete(request);
          }
        }
      }
    }
  }
}



self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    Promise.all([
      cleanupExpiredCache(),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过非GET请求
  if (request.method !== 'GET') return;

  // 跳过WebSocket
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // 跳过chrome-extension等
  if (!url.protocol.startsWith('http')) return;

  // 匹配缓存规则
  for (const rule of CACHE_RULES) {
    if (rule.pattern.test(url.pathname) || rule.pattern.test(url.href)) {
      switch (rule.strategy) {
        case 'cache-first':
          event.respondWith(cacheFirst(request, rule.cacheName, rule.maxAge || 3600));
          break;
        case 'network-first':
          event.respondWith(networkFirst(request, rule.cacheName, rule.maxAge || 30));
          break;
        case 'stale-while-revalidate':
          event.respondWith(staleWhileRevalidate(request, rule.cacheName, rule.maxAge || 60));
          break;
        case 'network-only':
          break;
      }
      return;
    }
  }

  // 默认: 网络优先
  event.respondWith(networkFirst(request, DYNAMIC_CACHE, 300));
});

// 后台定期清理缓存
self.addEventListener('periodicsync', (event: ExtendableEvent & { tag: string }) => {
  if (event.tag === 'cache-cleanup') {
    event.waitUntil(
      Promise.all(
        Object.entries(CACHE_LIMITS).map(([name, limit]) => trimCache(name, limit))
      )
    );
  }
});

// ==================== 后台同步 ====================
interface SyncQueueItem {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  retries: number;
}

self.addEventListener('sync', (event: ExtendableEvent & { tag: string }) => {
  if (event.tag === 'sync-watchlist') {
    event.waitUntil(syncQueue('watchlist'));
  } else if (event.tag === 'sync-alerts') {
    event.waitUntil(syncQueue('alerts'));
  } else if (event.tag === 'sync-portfolio') {
    event.waitUntil(syncQueue('portfolio'));
  }
});

async function syncQueue(type: string): Promise<void> {
  try {
    const cache = await caches.open(API_CACHE);
    const keys = await cache.keys();
    const pendingSyncs = keys.filter(r => r.url.includes(`/sync/${type}`));

    for (const request of pendingSyncs) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
        }
      } catch {
        // 网络仍不可用，保留在缓存中等待下次同步
      }
    }
  } catch (err) {
    // 同步失败，静默处理
  }
}

// ==================== 推送通知 ====================
self.addEventListener('push', async (event: ExtendableEvent & { data?: { json: () => Promise<any> } }) => {
  if (!event.data) return;

  try {
    const data = await event.data.json();
    const { title, body, type, stockCode, url } = data;

    const options: NotificationOptions & { actions?: Array<{ action: string; title: string }> } = {
      body: body || '收到新通知',
      icon: '/manifest.json',
      badge: '/manifest.json',
      tag: `${type}-${stockCode || 'general'}-${Date.now()}`,
      data: { url: url || '/', type, stockCode },
      actions: type === 'price-alert' ? [
        { action: 'view', title: '查看详情' },
        { action: 'dismiss', title: '忽略' },
      ] : undefined,
      requireInteraction: type === 'price-alert',
      // vibrate: type === 'price-alert' ? [200, 100, 200] : undefined, // 移除不支持的属性
    };

    event.waitUntil(
      self.registration.showNotification(title || 'A股行情', options)
    );
  } catch {
    // 推送数据解析失败
  }
});

self.addEventListener('notificationclick', (event: ExtendableEvent & { notification: Notification; action?: string }) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data;

  if (action === 'dismiss') return;

  const targetUrl = data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList: readonly Client[]) => {
        // 尝试聚焦已有窗口
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return (client as WindowClient).focus();
          }
        }
        // 打开新窗口
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

export {};
