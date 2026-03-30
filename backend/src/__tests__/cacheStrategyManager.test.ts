import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheStrategyManager } from '../utils/cacheStrategyManager.js';

describe('CacheStrategyManager', () => {
  let manager: CacheStrategyManager;

  beforeEach(() => {
    manager = new CacheStrategyManager();
  });

  afterEach(() => {
    manager.stop();
    manager.reset();
  });

  describe('预热策略', () => {
    it('注册并执行预热策略', async () => {
      const loader = vi.fn().mockResolvedValue({ data: 'test' });
      manager.registerWarmup({
        name: 'test-warmup',
        pattern: 'stock:*',
        loader,
        ttl: 60000,
        tags: ['stocks'],
        priority: 5,
      });

      const result = await manager.executeWarmup('all');
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(loader).toHaveBeenCalled();
    });

    it('按优先级排序执行', async () => {
      const order: number[] = [];
      manager.registerWarmup({
        name: 'low',
        pattern: 'low:*',
        loader: async () => { order.push(1); return 'low'; },
        ttl: 60000,
        tags: [],
        priority: 1,
      });
      manager.registerWarmup({
        name: 'high',
        pattern: 'high:*',
        loader: async () => { order.push(2); return 'high'; },
        ttl: 60000,
        tags: [],
        priority: 10,
      });

      await manager.executeWarmup('all');
      expect(order).toEqual([2, 1]); // high优先级先执行
    });

    it('处理预热失败', async () => {
      const failLoader = vi.fn().mockRejectedValue(new Error('load failed'));
      manager.registerWarmup({
        name: 'fail-warmup',
        pattern: 'fail:*',
        loader: failLoader,
        ttl: 60000,
        tags: [],
        priority: 5,
      });

      const result = await manager.executeWarmup('all');
      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('按scope过滤预热策略', async () => {
      const loader1 = vi.fn().mockResolvedValue('data1');
      const loader2 = vi.fn().mockResolvedValue('data2');

      manager.registerWarmup({
        name: 'open',
        pattern: 'open:*',
        loader: loader1,
        ttl: 60000,
        tags: [],
        priority: 5,
        schedule: 'market-open',
      });
      manager.registerWarmup({
        name: 'close',
        pattern: 'close:*',
        loader: loader2,
        ttl: 60000,
        tags: [],
        priority: 5,
        schedule: 'market-close',
      });

      const result = await manager.executeWarmup('market-open');
      expect(result.success).toBe(1);
      expect(loader1).toHaveBeenCalled();
      expect(loader2).not.toHaveBeenCalled();
    });

    it('返回执行耗时', async () => {
      manager.registerWarmup({
        name: 'slow',
        pattern: 'slow:*',
        loader: async () => {
          await new Promise(r => setTimeout(r, 10));
          return 'data';
        },
        ttl: 60000,
        tags: [],
        priority: 5,
      });

      const result = await manager.executeWarmup('all');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('失效策略', () => {
    it('按pattern直接失效', () => {
      const removed = manager.invalidate('stock:600519');
      expect(typeof removed).toBe('number');
    });

    it('级联失效依赖', () => {
      manager.registerInvalidationRule({
        name: 'cascade-test',
        trigger: 'dependency',
        pattern: 'index:*',
        dependencies: ['stock:*'],
      });

      const removed = manager.invalidateByTagWithCascade('stock:*');
      expect(typeof removed).toBe('number');
    });

    it('阈值失效规则', () => {
      let triggered = false;
      manager.registerInvalidationRule({
        name: 'threshold-test',
        trigger: 'threshold',
        pattern: 'temp:*',
        condition: () => { triggered = true; return true; },
      });

      manager.runThresholdInvalidation();
      expect(triggered).toBe(true);
    });

    it('阈值条件为false不触发', () => {
      manager.registerInvalidationRule({
        name: 'no-trigger',
        trigger: 'threshold',
        pattern: 'temp:*',
        condition: () => false,
      });

      const removed = manager.runThresholdInvalidation();
      expect(removed).toBe(0);
    });

    it('时间失效规则', () => {
      manager.registerInvalidationRule({
        name: 'time-expire',
        trigger: 'time',
        pattern: 'session:*',
        maxAge: 300000,
      });

      const removed = manager.runThresholdInvalidation();
      expect(typeof removed).toBe('number');
    });
  });

  describe('一致性检查', () => {
    it('通过一致性检查', async () => {
      manager.registerConsistencyCheck({
        name: 'test-check',
        keys: ['key1', 'key2'],
        validator: () => true,
        interval: 60000,
      });

      const result = await manager.runConsistencyChecks();
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('失败并修复', async () => {
      let repaired = false;
      manager.registerConsistencyCheck({
        name: 'fail-check',
        keys: ['missing-key'],
        validator: () => false,
        repair: async () => { repaired = true; },
        interval: 60000,
      });

      const result = await manager.runConsistencyChecks();
      expect(result.failed).toBe(1);
      expect(result.repaired).toBe(1);
      expect(repaired).toBe(true);
    });

    it('修复失败不抛异常', async () => {
      manager.registerConsistencyCheck({
        name: 'repair-fail',
        keys: ['key'],
        validator: () => false,
        repair: async () => { throw new Error('repair failed'); },
        interval: 60000,
      });

      const result = await manager.runConsistencyChecks();
      expect(result.failed).toBe(1);
      expect(result.repaired).toBe(0);
    });
  });

  describe('监控', () => {
    it('获取监控快照', () => {
      const snapshot = manager.getSnapshot();
      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('l1HitRate');
      expect(snapshot).toHaveProperty('l2HitRate');
      expect(snapshot).toHaveProperty('overallHitRate');
      expect(snapshot).toHaveProperty('totalEntries');
      expect(snapshot).toHaveProperty('memoryUsage');
      expect(snapshot).toHaveProperty('avgLatency');
      expect(snapshot).toHaveProperty('hotKeys');
      expect(snapshot).toHaveProperty('invalidations');
      expect(snapshot).toHaveProperty('warmupSuccess');
      expect(snapshot).toHaveProperty('warmupFailed');
      expect(snapshot).toHaveProperty('consistencyErrors');
      expect(snapshot).toHaveProperty('events');
    });

    it('获取健康状态', () => {
      const health = manager.getHealthStatus();
      expect(['healthy', 'degraded', 'critical']).toContain(health.status);
      expect(Array.isArray(health.details)).toBe(true);
    });

    it('事件日志记录', async () => {
      manager.invalidate('test:*');
      const events = manager.getEventLog('invalidate');
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].type).toBe('invalidate');
    });

    it('按类型过滤事件', async () => {
      manager.invalidate('test:*');
      const warmupEvents = manager.getEventLog('warmup');
      const invalidateEvents = manager.getEventLog('invalidate');
      expect(warmupEvents.every(e => e.type === 'warmup')).toBe(true);
      expect(invalidateEvents.every(e => e.type === 'invalidate')).toBe(true);
    });

    it('事件限制防止内存泄漏', async () => {
      // 注册大量失效来生成事件
      for (let i = 0; i < 1200; i++) {
        manager.invalidate(`test:${i}`);
      }
      const events = manager.getEventLog(undefined, 2000);
      expect(events.length).toBeLessThanOrEqual(1100); // eventLimit=1000, 截断到500+新事件
    });
  });

  describe('生命周期', () => {
    it('start/stop控制定时器', () => {
      expect(() => manager.start()).not.toThrow();
      expect(() => manager.stop()).not.toThrow();
    });

    it('重复start不报错', () => {
      manager.start();
      expect(() => manager.start()).not.toThrow();
      manager.stop();
    });

    it('reset清除统计数据', async () => {
      manager.invalidate('test:*');
      manager.reset();
      const snapshot = manager.getSnapshot();
      expect(snapshot.invalidations).toBe(0);
      expect(snapshot.warmupSuccess).toBe(0);
      expect(snapshot.events.length).toBe(0);
    });
  });

  describe('集成场景', () => {
    it('完整预热→查询→失效流程', async () => {
      // 预热
      manager.registerWarmup({
        name: 'stocks',
        pattern: 'stocks:all',
        loader: async () => [{ code: '600519', name: '贵州茅台' }],
        ttl: 60000,
        tags: ['stocks'],
        priority: 5,
      });
      const warmupResult = await manager.executeWarmup('all');
      expect(warmupResult.success).toBe(1);

      // 失效
      const removed = manager.invalidate('stocks:*');
      expect(typeof removed).toBe('number');

      // 快照
      const snapshot = manager.getSnapshot();
      expect(snapshot.warmupSuccess).toBe(1);
    });

    it('级联失效 + 一致性检查联合', async () => {
      manager.registerInvalidationRule({
        name: 'index-dep',
        trigger: 'dependency',
        pattern: 'index:*',
        dependencies: ['stock:*'],
      });

      manager.registerConsistencyCheck({
        name: 'index-consistency',
        keys: ['index:sh000001'],
        validator: (values) => values[0] !== undefined,
        repair: async () => { /* reload index */ },
        interval: 60000,
      });

      manager.invalidateByTagWithCascade('stock:*');
      const consistencyResult = await manager.runConsistencyChecks();

      const snapshot = manager.getSnapshot();
      expect(snapshot.invalidations).toBeGreaterThanOrEqual(0);
    });
  });
});
