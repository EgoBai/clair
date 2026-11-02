// 澄观 Clair — Service Worker v3
//
// v2 的两个缺陷（已修）：
//   1) STATIC_ASSETS 用的是站点根绝对路径（'/'、'/screener' ...）。本 SW 部署在
//      GitHub Pages 项目子路径 /clair/ 下，这些请求落到 https://egobai.github.io/
//      的通用 404，`cache.addAll` 整体 reject → install 失败 → SW 从未生效。
//   2) 导航请求（HTML 外壳）会被写进缓存，发布新版本后可能出现旧外壳。
//      现在导航一律 network-first 且**不缓存响应**，深链每次拿最新入口。
//
// 原则：缓存只用于离线兜底，绝不返回过期 HTML。

const CACHE_NAME = 'clair-v3';

// 作用域相对路径：SW 位于 /clair/sw.js，registration.scope 即 /clair/。
const scopeUrl = (p) => new URL(p, self.registration.scope).href;
const OFFLINE_URL = scopeUrl('offline.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      // 预缓存失败不得阻断安装，否则整个离线能力形同虚设。
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只接管同源请求；后端接口跨域，交给浏览器默认行为，避免缓存脏数据。
  if (url.origin !== self.location.origin) return;

  // 1) 导航（HTML 外壳）：network-first，命中即用，且永不写缓存。
  //    离线时才回落到 offline.html。
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((c) => c || new Response('', { status: 503 }))
      )
    );
    return;
  }

  // 2) 同源接口：network-first，仅缓存 2xx。
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || new Response('', { status: 503 })))
    );
    return;
  }

  // 3) 其余静态资源（带 hash 的 JS/CSS/图标）：stale-while-revalidate，仅缓存 2xx。
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || new Response('', { status: 503 }));
      return cached || network;
    })
  );
});
