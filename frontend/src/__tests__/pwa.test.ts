/**
 * PWA 与 Service Worker 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- 缓存策略测试 ----
type CacheStrategy = 'cache-first' | 'network-first' | 'stale-while-revalidate' | 'network-only';

interface CacheEntry {
  url: string;
  data: any;
  timestamp: number;
  ttl: number;
  strategy: CacheStrategy;
}

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < entry.ttl;
}

function shouldUseCache(entry: CacheEntry | undefined, strategy: CacheStrategy): boolean {
  if (!entry) return false;
  switch (strategy) {
    case 'cache-first':
      return isCacheValid(entry);
    case 'network-first':
      return false; // 总是先走网络
    case 'stale-while-revalidate':
      return true; // 总是返回缓存（同时刷新）
    case 'network-only':
      return false;
    default:
      return false;
  }
}

describe('缓存策略', () => {
  const validEntry: CacheEntry = {
    url: '/api/test',
    data: { value: 1 },
    timestamp: Date.now() - 1000,
    ttl: 30000,
    strategy: 'cache-first',
  };

  const expiredEntry: CacheEntry = {
    url: '/api/test',
    data: { value: 1 },
    timestamp: Date.now() - 60000,
    ttl: 30000,
    strategy: 'cache-first',
  };

  it('未过期缓存有效', () => {
    expect(isCacheValid(validEntry)).toBe(true);
  });

  it('过期缓存无效', () => {
    expect(isCacheValid(expiredEntry)).toBe(false);
  });

  it('cache-first 策略使用有效缓存', () => {
    expect(shouldUseCache(validEntry, 'cache-first')).toBe(true);
  });

  it('cache-first 策略忽略过期缓存', () => {
    expect(shouldUseCache(expiredEntry, 'cache-first')).toBe(false);
  });

  it('network-first 不使用缓存', () => {
    expect(shouldUseCache(validEntry, 'network-first')).toBe(false);
  });

  it('stale-while-revalidate 总是使用缓存', () => {
    expect(shouldUseCache(validEntry, 'stale-while-revalidate')).toBe(true);
    expect(shouldUseCache(expiredEntry, 'stale-while-revalidate')).toBe(true);
  });

  it('network-only 不使用缓存', () => {
    expect(shouldUseCache(validEntry, 'network-only')).toBe(false);
  });

  it('undefined缓存条目返回false', () => {
    expect(shouldUseCache(undefined, 'cache-first')).toBe(false);
  });
});

// ---- 缓存版本管理 ----
interface CacheVersion {
  version: string;
  staticAssets: string[];
  dynamicAssets: string[];
}

function shouldInvalidateCache(currentVersion: string, cachedVersion: string): boolean {
  return currentVersion !== cachedVersion;
}

function getCacheKey(url: string, version: string): string {
  return `v${version}:${url}`;
}

describe('缓存版本管理', () => {
  it('版本不变不清理', () => {
    expect(shouldInvalidateCache('1.0', '1.0')).toBe(false);
  });

  it('版本变化触发清理', () => {
    expect(shouldInvalidateCache('1.1', '1.0')).toBe(true);
  });

  it('缓存键包含版本', () => {
    expect(getCacheKey('/api/data', '2.0')).toBe('v2.0:/api/data');
  });

  it('不同URL不同缓存键', () => {
    const key1 = getCacheKey('/api/a', '1.0');
    const key2 = getCacheKey('/api/b', '1.0');
    expect(key1).not.toBe(key2);
  });
});

// ---- 离线状态检测 ----
function createNetworkStatusDetector() {
  let isOnline = true;
  const listeners: Array<(online: boolean) => void> = [];

  return {
    getStatus: () => isOnline,
    setOnline: (status: boolean) => {
      isOnline = status;
      listeners.forEach(fn => fn(status));
    },
    onChange: (fn: (online: boolean) => void) => {
      listeners.push(fn);
      return () => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

describe('网络状态检测', () => {
  it('初始状态为在线', () => {
    const detector = createNetworkStatusDetector();
    expect(detector.getStatus()).toBe(true);
  });

  it('设置离线状态', () => {
    const detector = createNetworkStatusDetector();
    detector.setOnline(false);
    expect(detector.getStatus()).toBe(false);
  });

  it('状态变更通知', () => {
    const detector = createNetworkStatusDetector();
    let notified: boolean | null = null;
    detector.onChange(online => { notified = online; });
    detector.setOnline(false);
    expect(notified).toBe(false);
  });

  it('取消订阅', () => {
    const detector = createNetworkStatusDetector();
    let count = 0;
    const unsub = detector.onChange(() => { count++; });
    detector.setOnline(false);
    unsub();
    detector.setOnline(true);
    expect(count).toBe(1);
  });
});

// ---- 推送通知数据格式 ----
interface PushNotification {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, any>;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  tag?: string;
  requireInteraction?: boolean;
}

function createPriceAlertNotification(
  symbol: string,
  price: number,
  change: number
): PushNotification {
  const direction = change >= 0 ? '上涨' : '下跌';
  return {
    title: `${symbol} 价格提醒`,
    body: `${symbol} ${direction} ${Math.abs(change).toFixed(2)}%，当前价格 ¥${price.toFixed(2)}`,
    icon: '/icons/stock-alert.png',
    tag: `price-alert-${symbol}`,
    data: { symbol, price, change, type: 'price-alert' },
    actions: [
      { action: 'view', title: '查看详情' },
      { action: 'dismiss', title: '忽略' },
    ],
  };
}

function createVolumeAlertNotification(
  symbol: string,
  volume: number,
  avgVolume: number
): PushNotification {
  const ratio = volume / avgVolume;
  return {
    title: `${symbol} 成交量异动`,
    body: `${symbol} 成交量是均值的 ${ratio.toFixed(1)} 倍`,
    icon: '/icons/volume-alert.png',
    tag: `volume-alert-${symbol}`,
    data: { symbol, volume, avgVolume, ratio, type: 'volume-alert' },
    requireInteraction: true,
  };
}

describe('推送通知格式', () => {
  it('价格提醒通知包含必要字段', () => {
    const notification = createPriceAlertNotification('600519', 1800, 5.5);
    expect(notification.title).toContain('600519');
    expect(notification.body).toContain('上涨');
    expect(notification.body).toContain('1800.00');
    expect(notification.tag).toBe('price-alert-600519');
  });

  it('下跌提醒正确显示', () => {
    const notification = createPriceAlertNotification('600519', 1700, -3.2);
    expect(notification.body).toContain('下跌');
  });

  it('成交量异动通知包含倍数', () => {
    const notification = createVolumeAlertNotification('000001', 5e8, 1e8);
    expect(notification.body).toContain('5.0');
    expect(notification.requireInteraction).toBe(true);
  });

  it('通知包含操作按钮', () => {
    const notification = createPriceAlertNotification('TEST', 100, 1);
    expect(notification.actions?.length).toBe(2);
    expect(notification.actions?.[0].action).toBe('view');
  });

  it('data字段包含完整信息', () => {
    const notification = createPriceAlertNotification('TEST', 100, 5);
    expect(notification.data?.symbol).toBe('TEST');
    expect(notification.data?.price).toBe(100);
    expect(notification.data?.type).toBe('price-alert');
  });
});

// ---- 首屏加载性能 ----
interface LoadMetrics {
  fcp: number;  // First Contentful Paint
  lcp: number;  // Largest Contentful Paint
  ttfb: number; // Time to First Byte
  cls: number;  // Cumulative Layout Shift
  fid: number;  // First Input Delay
}

function evaluateLoadPerformance(metrics: LoadMetrics): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendations: string[];
} {
  let score = 100;
  const recommendations: string[] = [];

  // FCP < 1.8s
  if (metrics.fcp > 1800) { score -= 20; recommendations.push('优化首次内容绘制'); }
  else if (metrics.fcp > 1000) { score -= 10; }

  // LCP < 2.5s
  if (metrics.lcp > 2500) { score -= 25; recommendations.push('优化最大内容绘制'); }
  else if (metrics.lcp > 1500) { score -= 10; }

  // TTFB < 800ms
  if (metrics.ttfb > 800) { score -= 15; recommendations.push('优化服务器响应时间'); }
  else if (metrics.ttfb > 400) { score -= 5; }

  // CLS < 0.1
  if (metrics.cls > 0.25) { score -= 20; recommendations.push('减少布局偏移'); }
  else if (metrics.cls > 0.1) { score -= 10; }

  // FID < 100ms
  if (metrics.fid > 300) { score -= 20; recommendations.push('减少主线程阻塞'); }
  else if (metrics.fid > 100) { score -= 10; }

  score = Math.max(0, score);

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return { score, grade, recommendations };
}

describe('首屏加载性能评估', () => {
  it('优秀性能得A级', () => {
    const result = evaluateLoadPerformance({
      fcp: 500, lcp: 1000, ttfb: 200, cls: 0.05, fid: 50,
    });
    expect(result.grade).toBe('A');
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.recommendations.length).toBe(0);
  });

  it('差性能得F级', () => {
    const result = evaluateLoadPerformance({
      fcp: 5000, lcp: 8000, ttfb: 3000, cls: 0.5, fid: 500,
    });
    expect(result.grade).toBe('F');
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('轻度超标有扣分', () => {
    const result = evaluateLoadPerformance({
      fcp: 1200, lcp: 2000, ttfb: 500, cls: 0.12, fid: 120,
    });
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBeGreaterThan(0);
  });

  it('有建议时分数低于100', () => {
    const result = evaluateLoadPerformance({
      fcp: 2000, lcp: 3000, ttfb: 1000, cls: 0.3, fid: 400,
    });
    expect(result.score).toBeLessThan(100);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('分数不低于0', () => {
    const result = evaluateLoadPerformance({
      fcp: 100000, lcp: 100000, ttfb: 100000, cls: 100, fid: 100000,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ---- 离线操作队列 ----
interface QueuedAction {
  id: string;
  type: 'add' | 'remove' | 'update';
  endpoint: string;
  payload: any;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

function createOfflineQueue() {
  const queue: QueuedAction[] = [];

  return {
    enqueue: (action: Omit<QueuedAction, 'id' | 'timestamp' | 'retries'>) => {
      queue.push({
        ...action,
        id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        retries: 0,
      });
    },
    dequeue: () => queue.shift(),
    peek: () => queue[0],
    size: () => queue.length,
    isEmpty: () => queue.length === 0,
    getAll: () => [...queue],
    removeById: (id: string) => {
      const idx = queue.findIndex(a => a.id === id);
      if (idx >= 0) queue.splice(idx, 1);
    },
    incrementRetry: (id: string) => {
      const action = queue.find(a => a.id === id);
      if (action) action.retries++;
    },
    shouldRetry: (id: string) => {
      const action = queue.find(a => a.id === id);
      return action ? action.retries < action.maxRetries : false;
    },
  };
}

describe('离线操作队列', () => {
  it('入队和出队', () => {
    const queue = createOfflineQueue();
    queue.enqueue({ type: 'add', endpoint: '/watchlist', payload: { symbol: '600519' }, maxRetries: 3 });
    expect(queue.size()).toBe(1);
    const action = queue.dequeue();
    expect(action?.type).toBe('add');
    expect(queue.isEmpty()).toBe(true);
  });

  it('peek不移除元素', () => {
    const queue = createOfflineQueue();
    queue.enqueue({ type: 'add', endpoint: '/test', payload: {}, maxRetries: 3 });
    const peeked = queue.peek();
    expect(queue.size()).toBe(1);
    expect(peeked?.type).toBe('add');
  });

  it('按ID删除', () => {
    const queue = createOfflineQueue();
    queue.enqueue({ type: 'add', endpoint: '/test', payload: {}, maxRetries: 3 });
    const id = queue.getAll()[0].id;
    queue.removeById(id);
    expect(queue.isEmpty()).toBe(true);
  });

  it('重试计数递增', () => {
    const queue = createOfflineQueue();
    queue.enqueue({ type: 'add', endpoint: '/test', payload: {}, maxRetries: 3 });
    const id = queue.getAll()[0].id;
    queue.incrementRetry(id);
    queue.incrementRetry(id);
    expect(queue.getAll()[0].retries).toBe(2);
  });

  it('shouldRetry判断正确', () => {
    const queue = createOfflineQueue();
    queue.enqueue({ type: 'add', endpoint: '/test', payload: {}, maxRetries: 2 });
    const id = queue.getAll()[0].id;
    expect(queue.shouldRetry(id)).toBe(true);
    queue.incrementRetry(id);
    queue.incrementRetry(id);
    expect(queue.shouldRetry(id)).toBe(false);
  });

  it('空队列操作', () => {
    const queue = createOfflineQueue();
    expect(queue.isEmpty()).toBe(true);
    expect(queue.dequeue()).toBeUndefined();
    expect(queue.peek()).toBeUndefined();
    expect(queue.size()).toBe(0);
  });
});
