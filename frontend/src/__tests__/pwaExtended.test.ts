/**
 * PWA 和 Service Worker 扩展测试
 * 覆盖缓存策略、推送通知、离线检测
 */

import { describe, it, expect } from 'vitest';

describe('Service Worker 缓存策略', () => {
  type CacheStrategy = 'cache-first' | 'network-first' | 'stale-while-revalidate' | 'network-only';

  interface CacheRule {
    pattern: RegExp;
    strategy: CacheStrategy;
    maxAge: number;
    maxEntries: number;
  }

  const cacheRules: CacheRule[] = [
    { pattern: /\.(js|css|woff2?)$/, strategy: 'cache-first', maxAge: 7 * 24 * 60 * 60 * 1000, maxEntries: 100 },
    { pattern: /\.(png|jpg|svg|ico)$/, strategy: 'cache-first', maxAge: 30 * 24 * 60 * 60 * 1000, maxEntries: 50 },
    { pattern: /\/api\/stocks/, strategy: 'network-first', maxAge: 30 * 1000, maxEntries: 200 },
    { pattern: /\/api\/quotes/, strategy: 'stale-while-revalidate', maxAge: 5 * 1000, maxEntries: 100 },
  ];

  function matchRule(url: string): CacheRule | null {
    for (const rule of cacheRules) {
      if (rule.pattern.test(url)) return rule;
    }
    return null;
  }

  it('JS/CSS 文件应匹配 cache-first', () => {
    const rule = matchRule('/assets/index.abc123.js');
    expect(rule).not.toBeNull();
    expect(rule!.strategy).toBe('cache-first');
  });

  it('图片文件应匹配 cache-first', () => {
    const rule = matchRule('/images/logo.png');
    expect(rule).not.toBeNull();
    expect(rule!.strategy).toBe('cache-first');
  });

  it('股票 API 应匹配 network-first', () => {
    const rule = matchRule('/api/stocks/600519');
    expect(rule).not.toBeNull();
    expect(rule!.strategy).toBe('network-first');
  });

  it('实时行情 API 应匹配 stale-while-revalidate', () => {
    const rule = matchRule('/api/quotes/realtime');
    expect(rule).not.toBeNull();
    expect(rule!.strategy).toBe('stale-while-revalidate');
  });

  it('未知 URL 应返回 null', () => {
    expect(matchRule('/unknown/path')).toBeNull();
  });

  it('缓存过期时间应合理', () => {
    for (const rule of cacheRules) {
      expect(rule.maxAge).toBeGreaterThan(0);
      expect(rule.maxEntries).toBeGreaterThan(0);
    }
  });

  it('静态资源应有较长缓存时间', () => {
    const jsRule = matchRule('/assets/app.js')!;
    const apiRule = matchRule('/api/stocks/600519')!;
    expect(jsRule.maxAge).toBeGreaterThan(apiRule.maxAge);
  });
});

describe('缓存版本管理', () => {
  const CURRENT_VERSION = 'v2.0.0';

  interface CacheVersion {
    name: string;
    version: string;
    entries: number;
  }

  const caches: CacheVersion[] = [
    { name: 'static-v1', version: 'v1.0.0', entries: 50 },
    { name: 'static-v2', version: 'v2.0.0', entries: 30 },
    { name: 'api-v1', version: 'v1.0.0', entries: 100 },
    { name: 'api-v2', version: 'v2.0.0', entries: 80 },
  ];

  it('应识别需要清理的旧版本缓存', () => {
    const stale = caches.filter(c => c.version !== CURRENT_VERSION);
    expect(stale).toHaveLength(2);
    expect(stale[0].name).toBe('static-v1');
  });

  it('当前版本缓存应保留', () => {
    const current = caches.filter(c => c.version === CURRENT_VERSION);
    expect(current).toHaveLength(2);
  });

  it('缓存清理应不影响当前版本', () => {
    const remaining = caches.filter(c => c.version === CURRENT_VERSION);
    const staleCount = caches.filter(c => c.version !== CURRENT_VERSION).length;
    expect(remaining.length + staleCount).toBe(caches.length);
  });
});

describe('推送通知数据模型', () => {
  interface PushNotification {
    id: string;
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag: string;
    data: {
      type: 'price-alert' | 'news' | 'system' | 'trade';
      stockSymbol?: string;
      url?: string;
    };
    timestamp: number;
    read: boolean;
  }

  function createNotification(type: PushNotification['data']['type']): PushNotification {
    return {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      title: '通知标题',
      body: '通知内容',
      tag: `tag-${type}`,
      data: { type },
      timestamp: Date.now(),
      read: false,
    };
  }

  it('应创建价格预警通知', () => {
    const n = createNotification('price-alert');
    expect(n.data.type).toBe('price-alert');
    expect(n.read).toBe(false);
  });

  it('通知类型应在预定义范围内', () => {
    const validTypes = ['price-alert', 'news', 'system', 'trade'];
    for (const type of validTypes) {
      const n = createNotification(type as any);
      expect(validTypes).toContain(n.data.type);
    }
  });

  it('未读通知应标记 read=false', () => {
    const n = createNotification('system');
    expect(n.read).toBe(false);
  });

  it('通知时间戳应为正整数', () => {
    const n = createNotification('news');
    expect(n.timestamp).toBeGreaterThan(0);
    expect(Number.isInteger(n.timestamp)).toBe(true);
  });
});

describe('离线状态检测', () => {
  interface NetworkState {
    online: boolean;
    lastOnline: number | null;
    offlineDuration: number;
  }

  function updateNetworkState(current: NetworkState, isOnline: boolean): NetworkState {
    const now = Date.now();
    if (isOnline) {
      return {
        online: true,
        lastOnline: now,
        offlineDuration: current.lastOnline ? now - current.lastOnline : 0,
      };
    }
    return {
      online: false,
      lastOnline: current.lastOnline,
      offlineDuration: current.lastOnline ? now - current.lastOnline : 0,
    };
  }

  it('上线应更新 lastOnline', () => {
    const state: NetworkState = { online: false, lastOnline: Date.now() - 5000, offlineDuration: 0 };
    const updated = updateNetworkState(state, true);
    expect(updated.online).toBe(true);
    expect(updated.lastOnline).toBeGreaterThan(0);
  });

  it('离线时长应正确计算', () => {
    const now = Date.now();
    const state: NetworkState = { online: false, lastOnline: now - 10000, offlineDuration: 0 };
    const updated = updateNetworkState(state, true);
    expect(updated.offlineDuration).toBeGreaterThanOrEqual(9000);
    expect(updated.offlineDuration).toBeLessThanOrEqual(11000);
  });

  it('离线时 online 应为 false', () => {
    const state: NetworkState = { online: true, lastOnline: Date.now(), offlineDuration: 0 };
    const updated = updateNetworkState(state, false);
    expect(updated.online).toBe(false);
  });
});
