import logger from './logger';
/**
 * Service Worker 注册工具
 * 处理 SW 生命周期、更新通知、离线检测
 */

interface SWConfig {
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onOffline?: () => void;
  onOnline?: () => void;
  scope?: string;
}

export function registerServiceWorker(config: SWConfig = {}): void {
  if (!('serviceWorker' in navigator)) {
    logger.warn('⚠️ Service Worker 不支持');
    return;
  }

  const { onUpdate, onOffline, onOnline, scope = '/' } = config;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope,
      });

      // 检测更新
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdate?.(registration);
            if (import.meta.env.DEV) {
              // removed: console.log
            }
          }
        });
      });

      // 监听控制器变化
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

      if (import.meta.env.DEV) {
        // removed: console.log
      }
    } catch (error) {
      logger.error('❌ Service Worker 注册失败:', error);
    }
  });

  // 离线/在线检测
  window.addEventListener('offline', () => {
    onOffline?.();
    if (import.meta.env.DEV) {
      // removed: console.log
    }
  });

  window.addEventListener('online', () => {
    onOnline?.();
    if (import.meta.env.DEV) {
      // removed: console.log
    }
  });
}

export function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }

  return navigator.serviceWorker.ready
    .then(registration => registration.unregister())
    .then(boolean => {
      if (boolean) {
        // removed: console.log
      }
      return boolean;
    })
    .catch(error => {
      logger.error('❌ Service Worker 注销失败:', error);
      return false;
    });
}

export function skipWaiting(): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'SKIP_WAITING' });
}

export function isOffline(): boolean {
  return !navigator.onLine;
}
