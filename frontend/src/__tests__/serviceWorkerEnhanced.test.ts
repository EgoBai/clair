/**
 * Service Worker 增强功能测试 - Round 163
 * 测试后台同步、推送通知、缓存版本管理、离线队列
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==================== 类型定义 ====================
type CacheStrategy = 'cache-first' | 'network-first' | 'stale-while-revalidate' | 'network-only';

interface CacheEntry {
  url: string;
  data: unknown;
  timestamp: number;
  ttl: number;
  strategy: CacheStrategy;
  version: string;
}

interface SyncTask {
  id: string;
  type: 'watchlist-sync' | 'alert-sync' | 'portfolio-sync' | 'settings-sync';
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
  maxRetries: number;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
}

interface PushNotification {
  id: string;
  title: string;
  body: string;
  type: 'price-alert' | 'market-event' | 'system' | 'news';
  stockCode?: string;
  timestamp: number;
  read: boolean;
  data?: Record<string, unknown>;
}

// ==================== 缓存版本管理器 ====================
class CacheVersionManager {
  private currentVersion: string;
  private versionHistory: string[];

  constructor(currentVersion: string) {
    this.currentVersion = currentVersion;
    this.versionHistory = [currentVersion];
  }

  getVersion(): string {
    return this.currentVersion;
  }

  bumpVersion(type: 'major' | 'minor' | 'patch'): string {
    const parts = this.currentVersion.split('.').map(Number);
    switch (type) {
      case 'major':
        parts[0]++;
        parts[1] = 0;
        parts[2] = 0;
        break;
      case 'minor':
        parts[1]++;
        parts[2] = 0;
        break;
      case 'patch':
        parts[2]++;
        break;
    }
    this.currentVersion = parts.join('.');
    this.versionHistory.push(this.currentVersion);
    return this.currentVersion;
  }

  shouldInvalidateCache(entryVersion: string): boolean {
    return entryVersion !== this.currentVersion;
  }

  getCacheName(prefix: string): string {
    return `${prefix}-${this.currentVersion}`;
  }

  getStaleCacheNames(prefix: string): string[] {
    return this.versionHistory
      .filter(v => v !== this.currentVersion)
      .map(v => `${prefix}-${v}`);
  }
}

// ==================== 离线同步队列 ====================
class OfflineSyncQueue {
  private queue: SyncTask[] = [];
  private storageKey = 'sw-sync-queue';

  add(task: Omit<SyncTask, 'id' | 'timestamp' | 'retries' | 'status'>): SyncTask {
    const newTask: SyncTask = {
      ...task,
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };
    this.queue.push(newTask);
    return newTask;
  }

  getPending(): SyncTask[] {
    return this.queue.filter(t => t.status === 'pending');
  }

  getByType(type: SyncTask['type']): SyncTask[] {
    return this.queue.filter(t => t.type === type);
  }

  markSyncing(id: string): boolean {
    const task = this.queue.find(t => t.id === id);
    if (task) {
      task.status = 'syncing';
      return true;
    }
    return false;
  }

  markCompleted(id: string): boolean {
    const idx = this.queue.findIndex(t => t.id === id);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  markFailed(id: string): boolean {
    const task = this.queue.find(t => t.id === id);
    if (task) {
      task.retries++;
      if (task.retries >= task.maxRetries) {
        task.status = 'failed';
      } else {
        task.status = 'pending';
      }
      return true;
    }
    return false;
  }

  getRetryable(): SyncTask[] {
    return this.queue.filter(t => t.status === 'pending' && t.retries < t.maxRetries);
  }

  getFailed(): SyncTask[] {
    return this.queue.filter(t => t.status === 'failed');
  }

  clear(): void {
    this.queue = [];
  }

  size(): number {
    return this.queue.length;
  }

  // 按优先级排序: alert > watchlist > portfolio > settings
  getPrioritized(): SyncTask[] {
    const priority: Record<SyncTask['type'], number> = {
      'alert-sync': 0,
      'watchlist-sync': 1,
      'portfolio-sync': 2,
      'settings-sync': 3,
    };
    return [...this.queue]
      .filter(t => t.status === 'pending')
      .sort((a, b) => priority[a.type] - priority[b.type]);
  }
}

// ==================== 推送通知管理器 ====================
class PushNotificationManager {
  private notifications: PushNotification[] = [];
  private maxNotifications = 100;

  add(notification: Omit<PushNotification, 'id' | 'timestamp' | 'read'>): PushNotification {
    const newNotif: PushNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    };
    this.notifications.unshift(newNotif);
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }
    return newNotif;
  }

  markRead(id: string): boolean {
    const notif = this.notifications.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      return true;
    }
    return false;
  }

  markAllRead(): number {
    let count = 0;
    this.notifications.forEach(n => {
      if (!n.read) {
        n.read = true;
        count++;
      }
    });
    return count;
  }

  getUnread(): PushNotification[] {
    return this.notifications.filter(n => !n.read);
  }

  getByType(type: PushNotification['type']): PushNotification[] {
    return this.notifications.filter(n => n.type === type);
  }

  getByStock(stockCode: string): PushNotification[] {
    return this.notifications.filter(n => n.stockCode === stockCode);
  }

  remove(id: string): boolean {
    const idx = this.notifications.findIndex(n => n.id === id);
    if (idx >= 0) {
      this.notifications.splice(idx, 1);
      return true;
    }
    return false;
  }

  clear(): void {
    this.notifications = [];
  }

  size(): number {
    return this.notifications.length;
  }

  // 获取摘要统计
  getStats(): { total: number; unread: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    this.notifications.forEach(n => {
      byType[n.type] = (byType[n.type] || 0) + 1;
    });
    return {
      total: this.notifications.length,
      unread: this.notifications.filter(n => !n.read).length,
      byType,
    };
  }
}

// ==================== 智能缓存路由 ====================
class SmartCacheRouter {
  private rules: Array<{
    pattern: RegExp;
    strategy: CacheStrategy;
    cacheName: string;
    maxAge: number;
    priority: number;
  }> = [];

  addRule(rule: { pattern: RegExp; strategy: CacheStrategy; cacheName: string; maxAge: number; priority?: number }): void {
    this.rules.push({ ...rule, priority: rule.priority || 0 });
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  resolve(url: string): { strategy: CacheStrategy; cacheName: string; maxAge: number } | null {
    for (const rule of this.rules) {
      if (rule.pattern.test(url)) {
        return { strategy: rule.strategy, cacheName: rule.cacheName, maxAge: rule.maxAge };
      }
    }
    return null;
  }

  removeRule(pattern: RegExp): boolean {
    const idx = this.rules.findIndex(r => r.pattern.source === pattern.source);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }

  getRules(): Array<{ pattern: string; strategy: CacheStrategy; cacheName: string; maxAge: number }> {
    return this.rules.map(r => ({
      pattern: r.pattern.source,
      strategy: r.strategy,
      cacheName: r.cacheName,
      maxAge: r.maxAge,
    }));
  }
}

// ==================== 测试 ====================
describe('Service Worker 增强功能', () => {
  describe('缓存版本管理', () => {
    let manager: CacheVersionManager;

    beforeEach(() => {
      manager = new CacheVersionManager('2.0.0');
    });

    it('应该返回当前版本', () => {
      expect(manager.getVersion()).toBe('2.0.0');
    });

    it('应该正确bump主版本号', () => {
      expect(manager.bumpVersion('major')).toBe('3.0.0');
    });

    it('应该正确bump次版本号', () => {
      expect(manager.bumpVersion('minor')).toBe('2.1.0');
    });

    it('应该正确bump补丁版本号', () => {
      expect(manager.bumpVersion('patch')).toBe('2.0.1');
    });

    it('应该检测过期缓存版本', () => {
      expect(manager.shouldInvalidateCache('1.0.0')).toBe(true);
      expect(manager.shouldInvalidateCache('2.0.0')).toBe(false);
    });

    it('应该生成正确的缓存名称', () => {
      expect(manager.getCacheName('static')).toBe('static-2.0.0');
      expect(manager.getCacheName('api')).toBe('api-2.0.0');
    });

    it('应该获取过期缓存名列表', () => {
      manager.bumpVersion('minor');
      manager.bumpVersion('patch');
      const stale = manager.getStaleCacheNames('static');
      expect(stale).toContain('static-2.0.0');
      expect(stale).toContain('static-2.1.0');
      expect(stale).not.toContain('static-2.1.1');
    });

    it('连续多次bump应该正确工作', () => {
      manager.bumpVersion('patch'); // 2.0.1
      manager.bumpVersion('patch'); // 2.0.2
      manager.bumpVersion('minor'); // 2.1.0 (resets patch)
      expect(manager.getVersion()).toBe('2.1.0');
    });
  });

  describe('离线同步队列', () => {
    let queue: OfflineSyncQueue;

    beforeEach(() => {
      queue = new OfflineSyncQueue();
    });

    it('应该添加同步任务', () => {
      const task = queue.add({
        type: 'watchlist-sync',
        payload: { stockCode: '600519', action: 'add' },
        maxRetries: 3,
      });
      expect(task.id).toBeDefined();
      expect(task.status).toBe('pending');
      expect(task.retries).toBe(0);
      expect(queue.size()).toBe(1);
    });

    it('应该获取待处理任务', () => {
      queue.add({ type: 'watchlist-sync', payload: {}, maxRetries: 3 });
      queue.add({ type: 'alert-sync', payload: {}, maxRetries: 3 });
      expect(queue.getPending().length).toBe(2);
    });

    it('应该按类型筛选任务', () => {
      queue.add({ type: 'watchlist-sync', payload: {}, maxRetries: 3 });
      queue.add({ type: 'alert-sync', payload: {}, maxRetries: 3 });
      queue.add({ type: 'watchlist-sync', payload: {}, maxRetries: 3 });
      expect(queue.getByType('watchlist-sync').length).toBe(2);
    });

    it('应该标记同步中状态', () => {
      const task = queue.add({ type: 'watchlist-sync', payload: {}, maxRetries: 3 });
      queue.markSyncing(task.id);
      expect(queue.getPending().length).toBe(0);
    });

    it('应该完成并移除任务', () => {
      const task = queue.add({ type: 'watchlist-sync', payload: {}, maxRetries: 3 });
      queue.markCompleted(task.id);
      expect(queue.size()).toBe(0);
    });

    it('应该处理失败重试', () => {
      const task = queue.add({ type: 'watchlist-sync', payload: {}, maxRetries: 3 });
      queue.markFailed(task.id);
      const pending = queue.getPending();
      expect(pending.length).toBe(1);
      expect(pending[0].retries).toBe(1);
    });

    it('超过最大重试次数应标记为失败', () => {
      const task = queue.add({ type: 'watchlist-sync', payload: {}, maxRetries: 2 });
      queue.markFailed(task.id);
      queue.markFailed(task.id);
      expect(queue.getFailed().length).toBe(1);
      expect(queue.getRetryable().length).toBe(0);
    });

    it('应该按优先级排序', () => {
      queue.add({ type: 'settings-sync', payload: {}, maxRetries: 3 });
      queue.add({ type: 'alert-sync', payload: {}, maxRetries: 3 });
      queue.add({ type: 'portfolio-sync', payload: {}, maxRetries: 3 });
      queue.add({ type: 'watchlist-sync', payload: {}, maxRetries: 3 });
      const prioritized = queue.getPrioritized();
      expect(prioritized[0].type).toBe('alert-sync');
      expect(prioritized[1].type).toBe('watchlist-sync');
      expect(prioritized[2].type).toBe('portfolio-sync');
      expect(prioritized[3].type).toBe('settings-sync');
    });

    it('应该清空队列', () => {
      queue.add({ type: 'watchlist-sync', payload: {}, maxRetries: 3 });
      queue.add({ type: 'alert-sync', payload: {}, maxRetries: 3 });
      queue.clear();
      expect(queue.size()).toBe(0);
    });
  });

  describe('推送通知管理', () => {
    let manager: PushNotificationManager;

    beforeEach(() => {
      manager = new PushNotificationManager();
    });

    it('应该添加通知', () => {
      const notif = manager.add({
        title: '价格预警',
        body: '贵州茅台突破2000元',
        type: 'price-alert',
        stockCode: '600519',
      });
      expect(notif.id).toBeDefined();
      expect(notif.read).toBe(false);
      expect(manager.size()).toBe(1);
    });

    it('应该标记已读', () => {
      const notif = manager.add({
        title: '测试',
        body: '测试',
        type: 'system',
      });
      manager.markRead(notif.id);
      expect(manager.getUnread().length).toBe(0);
    });

    it('应该全部标记已读', () => {
      manager.add({ title: '1', body: '1', type: 'system' });
      manager.add({ title: '2', body: '2', type: 'price-alert' });
      manager.add({ title: '3', body: '3', type: 'news' });
      const count = manager.markAllRead();
      expect(count).toBe(3);
      expect(manager.getUnread().length).toBe(0);
    });

    it('应该按类型筛选通知', () => {
      manager.add({ title: '1', body: '1', type: 'price-alert', stockCode: '600519' });
      manager.add({ title: '2', body: '2', type: 'news' });
      manager.add({ title: '3', body: '3', type: 'price-alert', stockCode: '000858' });
      expect(manager.getByType('price-alert').length).toBe(2);
    });

    it('应该按股票代码筛选', () => {
      manager.add({ title: '1', body: '1', type: 'price-alert', stockCode: '600519' });
      manager.add({ title: '2', body: '2', type: 'price-alert', stockCode: '000858' });
      manager.add({ title: '3', body: '3', type: 'market-event' });
      expect(manager.getByStock('600519').length).toBe(1);
    });

    it('应该删除通知', () => {
      const notif = manager.add({ title: '1', body: '1', type: 'system' });
      manager.remove(notif.id);
      expect(manager.size()).toBe(0);
    });

    it('应该限制最大通知数量', () => {
      for (let i = 0; i < 110; i++) {
        manager.add({ title: `${i}`, body: `${i}`, type: 'system' });
      }
      expect(manager.size()).toBe(100);
    });

    it('应该生成统计信息', () => {
      manager.add({ title: '1', body: '1', type: 'price-alert', stockCode: '600519' });
      manager.add({ title: '2', body: '2', type: 'news' });
      manager.add({ title: '3', body: '3', type: 'price-alert', stockCode: '000858' });
      const stats = manager.getStats();
      expect(stats.total).toBe(3);
      expect(stats.unread).toBe(3);
      expect(stats.byType['price-alert']).toBe(2);
      expect(stats.byType['news']).toBe(1);
    });

    it('清空所有通知', () => {
      manager.add({ title: '1', body: '1', type: 'system' });
      manager.clear();
      expect(manager.size()).toBe(0);
    });
  });

  describe('智能缓存路由', () => {
    let router: SmartCacheRouter;

    beforeEach(() => {
      router = new SmartCacheRouter();
      router.addRule({ pattern: /\.(js|css)$/, strategy: 'cache-first', cacheName: 'static', maxAge: 604800, priority: 10 });
      router.addRule({ pattern: /\/api\/stocks/, strategy: 'network-first', cacheName: 'api', maxAge: 30, priority: 5 });
      router.addRule({ pattern: /\/api\/search/, strategy: 'stale-while-revalidate', cacheName: 'api', maxAge: 60, priority: 5 });
      router.addRule({ pattern: /\/ws/, strategy: 'network-only', cacheName: '', maxAge: 0, priority: 20 });
    });

    it('应该匹配静态资源规则', () => {
      const result = router.resolve('/assets/main.js');
      expect(result?.strategy).toBe('cache-first');
      expect(result?.cacheName).toBe('static');
    });

    it('应该匹配API规则', () => {
      const result = router.resolve('/api/stocks/list');
      expect(result?.strategy).toBe('network-first');
    });

    it('应该匹配搜索规则', () => {
      const result = router.resolve('/api/search?q=test');
      expect(result?.strategy).toBe('stale-while-revalidate');
    });

    it('应该匹配WebSocket规则（最高优先级）', () => {
      const result = router.resolve('/ws/realtime');
      expect(result?.strategy).toBe('network-only');
    });

    it('未匹配应该返回null', () => {
      const result = router.resolve('/unknown/path');
      expect(result).toBeNull();
    });

    it('应该获取所有规则', () => {
      const rules = router.getRules();
      expect(rules.length).toBe(4);
    });

    it('应该删除规则', () => {
      router.removeRule(/\/api\/search/);
      const result = router.resolve('/api/search?q=test');
      expect(result).toBeNull();
    });
  });

  describe('缓存策略集成', () => {
    it('应该为不同资源类型选择正确策略', () => {
      const router = new SmartCacheRouter();
      router.addRule({ pattern: /\.(js|css|woff2?)$/, strategy: 'cache-first', cacheName: 'static', maxAge: 604800 });
      router.addRule({ pattern: /\.(png|jpg|webp|svg)$/, strategy: 'cache-first', cacheName: 'images', maxAge: 2592000 });
      router.addRule({ pattern: /\/api\/(stocks|quotes|market)/, strategy: 'network-first', cacheName: 'api', maxAge: 30 });
      router.addRule({ pattern: /\/api\/search/, strategy: 'stale-while-revalidate', cacheName: 'api', maxAge: 60 });
      router.addRule({ pattern: /\/api\/(watchlist|alerts)/, strategy: 'stale-while-revalidate', cacheName: 'api', maxAge: 120 });
      router.addRule({ pattern: /\/api\/(news|ai)/, strategy: 'network-first', cacheName: 'api', maxAge: 300 });

      expect(router.resolve('/assets/main.abc123.js')?.strategy).toBe('cache-first');
      expect(router.resolve('/images/logo.png')?.strategy).toBe('cache-first');
      expect(router.resolve('/api/stocks/600519')?.strategy).toBe('network-first');
      expect(router.resolve('/api/search?q=baidu')?.strategy).toBe('stale-while-revalidate');
      expect(router.resolve('/api/watchlist')?.strategy).toBe('stale-while-revalidate');
      expect(router.resolve('/api/news')?.strategy).toBe('network-first');
    });

    it('版本升级后应清理旧缓存', () => {
      const manager = new CacheVersionManager('1.0.0');
      manager.bumpVersion('minor');
      manager.bumpVersion('minor');

      const staleStatic = manager.getStaleCacheNames('static');
      const staleApi = manager.getStaleCacheNames('api');

      expect(staleStatic).toContain('static-1.0.0');
      expect(staleStatic).toContain('static-1.1.0');
      expect(staleApi).toContain('api-1.0.0');
      expect(staleApi).toContain('api-1.1.0');
    });

    it('离线队列与通知协同工作', () => {
      const queue = new OfflineSyncQueue();
      const notifs = new PushNotificationManager();

      // 模拟离线时添加预警
      const task = queue.add({
        type: 'alert-sync',
        payload: { stockCode: '600519', condition: 'price-above', value: 2000 },
        maxRetries: 3,
      });

      // 模拟收到价格预警推送
      const notif = notifs.add({
        title: '价格预警触发',
        body: '贵州茅台(600519) 价格突破 2000.00',
        type: 'price-alert',
        stockCode: '600519',
        data: { price: 2005.5 },
      });

      expect(queue.size()).toBe(1);
      expect(notifs.getByStock('600519').length).toBe(1);

      // 模拟同步完成
      queue.markCompleted(task.id);
      expect(queue.size()).toBe(0);
    });
  });
});
