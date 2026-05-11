// AStock Service Worker — 离线缓存 + 更新提示
const CACHE = 'astock-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// 安装 — 预缓存核心资源
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 激活 — 清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求 — 缓存优先 + 网络更新
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // API 请求走网络
  if (e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if (res.ok && !e.request.url.includes('chrome-extension')) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
      return cached || fetched;
    })
  );
});
