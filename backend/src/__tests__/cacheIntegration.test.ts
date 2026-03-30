/**
 * 缓存集成测试
 * 验证各缓存模块协同工作
 * Round 103: 缓存集成验证
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CacheStrategyManager } from '../utils/cacheStrategyManager.js';
import { CacheInvalidationRouter } from '../utils/cacheInvalidationRouter.js';
import { CacheConsistencyEngine } from '../utils/cacheConsistencyEngine.js';
import { CacheMonitorDashboard } from '../utils/cacheMonitorDashboard.js';
import { MarketCacheWarmupService } from '../utils/marketCacheWarmupService.js';

describe('缓存系统集成', () => {
  let strategy: CacheStrategyManager;
  let router: CacheInvalidationRouter;
  let consistency: CacheConsistencyEngine;
  let monitor: CacheMonitorDashboard;
  let warmup: MarketCacheWarmupService;

  beforeEach(() => {
    strategy = new CacheStrategyManager();
    router = new CacheInvalidationRouter();
    consistency = new CacheConsistencyEngine('eventual', 'write-through', 'last-write-wins');
    monitor = new CacheMonitorDashboard();
    warmup = new MarketCacheWarmupService();
  });

  describe('预热→写入→一致性→监控完整链路', () => {
    it('行情数据预热后可读取并监控', async () => {
      // 1. 注册预热任务
      warmup.registerTask({
        id: 'stock-600519',
        name: '贵州茅台行情',
        category: 'stock',
        priority: 8,
        loader: async () => ({ code: '600519', name: '贵州茅台', price: 1800 }),
        ttl: 60000,
        tags: ['stocks'],
      });

      // 2. 执行预热
      const result = await warmup.executeTask('stock-600519');
      expect(result.success).toBe(true);

      // 3. 写入一致性引擎
      consistency.write('stock:600519', { price: 1800 }, 'warmup');

      // 4. 读取验证
      const read = consistency.read('stock:600519');
      expect(read.value).toEqual({ price: 1800 });
      expect(read.consistent).toBe(true);

      // 5. 监控面板可采集
      const dashboard = monitor.getDashboardMetrics();
      expect(dashboard.health).toBeDefined();
      expect(dashboard.timestamp).toBeGreaterThan(0);
    });
  });

  describe('依赖失效→级联→版本追踪', () => {
    it('股票变更级联失效行情和指数', () => {
      // 注册依赖
      router.addDependency('quote:600519', ['stock:600519']);
      router.addDependency('index:sh000001', ['quote:600519']);

      // 写入数据
      consistency.write('stock:600519', { price: 1800 }, 'source1');
      consistency.write('quote:600519', { price: 1800, bid: 1799 }, 'derived');
      consistency.write('index:sh000001', { value: 3200 }, 'derived');

      // 数据变更→级联失效
      const invalidated = router.invalidate('stock:600519', 'data-stale');
      expect(invalidated).toContain('stock:600519');
      expect(invalidated).toContain('quote:600519');
      expect(invalidated).toContain('index:sh000001');

      // 版本递增
      expect(router.getVersion('stock:600519')).toBe(1);
      expect(router.getVersion('quote:600519')).toBe(1);
      expect(router.getVersion('index:sh000001')).toBe(1);
    });
  });

  describe('策略预热→失效规则→监控健康', () => {
    it('预热策略注册执行并监控', async () => {
      // 注册预热策略
      strategy.registerWarmup({
        name: '市场概况',
        pattern: 'market:overview',
        loader: async () => ({ status: 'open', indices: 3 }),
        ttl: 30000,
        tags: ['market'],
        priority: 10,
        schedule: 'market-open',
      });

      // 执行预热
      const warmupResult = await strategy.executeWarmup('market-open');
      expect(warmupResult.success).toBe(1);

      // 注册失效规则
      strategy.registerInvalidationRule({
        name: 'market-close-clear',
        trigger: 'time',
        pattern: 'market:*',
        maxAge: 3600000,
      });

      // 健康检查
      const health = strategy.getHealthStatus();
      expect(['healthy', 'degraded', 'critical']).toContain(health.status);

      // 快照
      const snapshot = strategy.getSnapshot();
      expect(snapshot.warmupSuccess).toBe(1);
    });
  });

  describe('多源数据合并一致性', () => {
    it('不同来源的行情数据合并', () => {
      const merger = new CacheConsistencyEngine('strong', 'write-through', 'merge');

      // 来源1：实时行情
      merger.write('quote:600519', { price: 1800, volume: 10000 }, 'realtime');
      // 来源2：基本面
      merger.write('quote:600519', { pe: 35.2, pb: 11.8 }, 'fundamental');
      // 来源3：技术指标
      merger.write('quote:600519', { ma5: 1790, ma20: 1750 }, 'technical');

      const result = merger.read('quote:600519');
      expect(result.value).toEqual({
        price: 1800,
        volume: 10000,
        pe: 35.2,
        pb: 11.8,
        ma5: 1790,
        ma20: 1750,
      });
    });
  });

  describe('性能基线', () => {
    it('大量写入读取性能', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        consistency.write(`stock:${i}`, { price: Math.random() * 100 }, 'bench');
      }

      for (let i = 0; i < 1000; i++) {
        consistency.read(`stock:${i}`);
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000); // 1000次写+读 < 5秒
    });

    it('大量依赖注册和失效', () => {
      const start = Date.now();

      for (let i = 0; i < 500; i++) {
        router.addDependency(`quote:${i}`, [`stock:${i}`]);
      }

      for (let i = 0; i < 500; i++) {
        router.invalidate(`stock:${i}`, 'data-stale');
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });

  afterEach(() => {
    strategy.stop();
    strategy.reset();
    router.clear();
    consistency.clear();
    monitor.clear();
    warmup.clear();
  });
});
