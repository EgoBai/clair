/**
 * Service Worker - A股行情分析网站
 * 支持多级缓存策略、后台同步、推送通知
 */

const CACHE_VERSION = 'v2.0.0';
const STATIC_CACHE = `a-stock-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `a-stock-dynamic-${CACHE_VERSION}`;
const API_CACHE = `a-stock-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `a-stock-images-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// 缓存规则
const CACHE_RULES = [
  { pattern: /\.(js|css|woff2?|ttf|eot)$/, strategy: 'cache-first', cache: STATIC_CACHE, maxAge: 604800 },
  { pattern: /\.(png|jpg|jpeg|gif|svg|webp|ico)$/, strategy: 'cache-first', cache: IMAGE_CACHE, maxAge: 2592000 },
  { pattern: /\/api\/(stocks|quotes|market)/, strategy: 'network-first', cache: API_CACHE, maxAge: 30 },
  { pattern: /\/api\/search/, strategy: 'stale-while-revalidate', cache: API_CACHE, maxAge: 60 },
  { pattern: /\/api\/(watchlist|alerts|portfolio)/, strategy: 'stale-while-revalidate', cache: API_CACHE, maxAge: 120 },
  { pattern: /\/api\/(news|ai)/, strategy: 'network-first', cache: API_CACHE, maxAge: 300 },
  { pattern: /\/ws/, strategy: 'network-only', cache: '', maxAge: 0 },
];

// ==================== 安装 & 激活 ====================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // 清理旧版本缓存
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => !key.includes(CACHE_VERSION))
            .map(key => caches.delete(key))
        )
      ),
      self.clients.claim(),
    ])
  );
});

// ==================== 缓存策略实现 ====================
function addCacheDateHeader(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cache-date', String(Date.now()));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isExpired(response, maxAge) {
  const cacheDate = response.headers.get('sw-cache-date');
  if (!cacheDate) return true;
  return (Date.now() - parseInt(cacheDate, 10)) / 1000 > maxAge;
}

async function cacheFirst(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached && !isExpired(cached, maxAge)) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, addCacheDateHeader(response.clone()));
    }
    return response;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, addCacheDateHeader(response.clone()));
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ success: false, error: '离线状态' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, addCacheDateHeader(response.clone()));
      }
      return response;
    })
    .catch(() => cached);

  if (cached) return cached;
  return fetchPromise;
}

// ==================== 请求拦截 ====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  if (!url.protocol.startsWith('http')) return;

  for (const rule of CACHE_RULES) {
    if (rule.pattern.test(url.pathname) || rule.pattern.test(url.href)) {
      switch (rule.strategy) {
        case 'cache-first':
          event.respondWith(cacheFirst(request, rule.cache, rule.maxAge));
          break;
        case 'network-first':
          event.respondWith(networkFirst(request, rule.cache, rule.maxAge));
          break;
        case 'stale-while-revalidate':
          event.respondWith(staleWhileRevalidate(request, rule.cache, rule.maxAge));
          break;
        case 'network-only':
          break;
      }
      return;
    }
  }

  // 默认网络优先
  event.respondWith(networkFirst(request, DYNAMIC_CACHE, 300));
});

// ==================== 消息处理 ====================
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'clearCache') {
    caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
  }
  if (event.data === 'getVersion') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});

// ==================== 后台同步 ====================
self.addEventListener('sync', (event) => {
  if (event.tag.startsWith('sync-')) {
    event.waitUntil(handleBackgroundSync(event.tag));
  }
});

async function handleBackgroundSync(tag) {
  const type = tag.replace('sync-', '');
  try {
    const cache = await caches.open(API_CACHE);
    const keys = await cache.keys();
    for (const request of keys) {
      if (request.url.includes(`/sync/${type}`)) {
        try {
          const response = await fetch(request);
          if (response.ok) await cache.delete(request);
        } catch { /* 网络不可用，下次重试 */ }
      }
    }
  } catch { /* 静默处理 */ }
}

// ==================== 推送通知 ====================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'A股行情', {
        body: data.body || '收到新通知',
        icon: '/manifest.json',
        tag: `${data.type || 'general'}-${Date.now()}`,
        data: { url: data.url || '/', type: data.type },
        requireInteraction: data.type === 'price-alert',
      })
    );
  } catch { /* 解析失败 */ }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (const client of clients) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
