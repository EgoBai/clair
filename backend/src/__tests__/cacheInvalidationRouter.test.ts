import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheInvalidationRouter } from '../utils/cacheInvalidationRouter.js';

describe('CacheInvalidationRouter', () => {
  let router: CacheInvalidationRouter;

  beforeEach(() => {
    router = new CacheInvalidationRouter();
  });

  describe('依赖图管理', () => {
    it('添加依赖关系', () => {
      router.addDependency('index:sh000001', ['stock:600519', 'stock:000858']);
      const graph = router.getDependencyGraph();
      const indexNode = graph.find(n => n.key === 'index:sh000001');
      expect(indexNode?.dependsOn).toContain('stock:600519');
      expect(indexNode?.dependsOn).toContain('stock:000858');
    });

    it('反向依赖自动建立', () => {
      router.addDependency('child', ['parent']);
      const graph = router.getDependencyGraph();
      const parentNode = graph.find(n => n.key === 'parent');
      expect(parentNode?.dependedBy).toContain('child');
    });

    it('移除依赖', () => {
      router.addDependency('a', ['b']);
      router.removeDependency('a', 'b');
      const graph = router.getDependencyGraph();
      const aNode = graph.find(n => n.key === 'a');
      expect(aNode?.dependsOn).not.toContain('b');
    });

    it('获取下游依赖链', () => {
      router.addDependency('B', ['A']);
      router.addDependency('C', ['B']);
      router.addDependency('D', ['B']);
      const chain = router.getDependencyChain('A', 'down');
      expect(chain).toContain('B');
      expect(chain).toContain('C');
      expect(chain).toContain('D');
    });

    it('获取上游依赖链', () => {
      router.addDependency('C', ['A', 'B']);
      const chain = router.getDependencyChain('C', 'up');
      expect(chain).toContain('A');
      expect(chain).toContain('B');
    });

    it('循环依赖不无限递归', () => {
      router.addDependency('A', ['B']);
      router.addDependency('B', ['A']);
      const chain = router.getDependencyChain('A', 'down');
      expect(chain.length).toBeLessThan(100);
    });
  });

  describe('失效操作', () => {
    it('失效单个key', () => {
      const result = router.invalidate('test:key');
      expect(result).toContain('test:key');
    });

    it('级联失效下游依赖', () => {
      router.addDependency('derived', ['source']);
      const result = router.invalidate('source');
      expect(result).toContain('source');
      expect(result).toContain('derived');
    });

    it('多层级级联', () => {
      router.addDependency('level2', ['level1']);
      router.addDependency('level3', ['level2']);
      const result = router.invalidate('level1');
      expect(result).toContain('level1');
      expect(result).toContain('level2');
      expect(result).toContain('level3');
    });

    it('批量失效', () => {
      const result = router.invalidateBatch(['key1', 'key2', 'key3']);
      expect(result).toContain('key1');
      expect(result).toContain('key2');
      expect(result).toContain('key3');
    });

    it('pattern匹配失效', () => {
      router.addDependency('stock:600519:price', []);
      router.addDependency('stock:000858:price', []);
      router.addDependency('index:sh000001', []);
      const result = router.invalidatePattern('stock:*');
      expect(result).toContain('stock:600519:price');
      expect(result).toContain('stock:000858:price');
      expect(result).not.toContain('index:sh000001');
    });

    it('记录失效原因', () => {
      router.invalidate('key', 'ttl-expired', 'auto');
      const history = router.getHistory();
      expect(history[0].reason).toBe('ttl-expired');
      expect(history[0].source).toBe('auto');
    });
  });

  describe('延迟失效', () => {
    it('调度延迟失效', () => {
      router.scheduleDelayedInvalidation('key', 100, 'data-stale');
      // 立即检查不会失效
      expect(router.getHistory().length).toBe(0);
    });

    it('延迟到期后执行失效', async () => {
      router.scheduleDelayedInvalidation('key', 10, 'data-stale');
      await new Promise(r => setTimeout(r, 200));
      const stats = router.getStats();
      expect(stats.delayedInvalidations).toBe(1);
    });
  });

  describe('版本控制', () => {
    it('初始版本为0', () => {
      expect(router.getVersion('new-key')).toBe(0);
    });

    it('失效后版本递增', () => {
      router.addDependency('key', []);
      router.invalidate('key');
      expect(router.getVersion('key')).toBe(1);
    });

    it('bumpVersion不触发失效', () => {
      const handler = vi.fn();
      router.on('manual', handler);
      router.bumpVersion('key');
      expect(handler).not.toHaveBeenCalled();
      expect(router.getVersion('key')).toBe(1);
    });

    it('版本一致性检查', () => {
      router.addDependency('key', []);
      router.invalidate('key'); // version becomes 1
      expect(router.checkVersion('key', 1)).toBe(true);
      expect(router.checkVersion('key', 0)).toBe(false);
    });
  });

  describe('事件系统', () => {
    it('监听特定原因的事件', () => {
      const handler = vi.fn();
      router.on('manual', handler);
      router.invalidate('key', 'manual');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        key: 'key',
        reason: 'manual',
      }));
    });

    it('wildcard监听所有事件', () => {
      const handler = vi.fn();
      router.on('*', handler);
      router.invalidate('key1', 'manual');
      router.invalidate('key2', 'ttl-expired');
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('移除监听器', () => {
      const handler = vi.fn();
      router.on('manual', handler);
      router.off('manual', handler);
      router.invalidate('key', 'manual');
      expect(handler).not.toHaveBeenCalled();
    });

    it('级联事件也触发监听器', () => {
      router.addDependency('child', ['parent']);
      const handler = vi.fn();
      router.on('dependency-changed', handler);
      router.invalidate('parent');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        key: 'child',
        reason: 'dependency-changed',
      }));
    });
  });

  describe('统计查询', () => {
    it('统计失效次数', () => {
      router.invalidate('k1');
      router.invalidate('k2');
      const stats = router.getStats();
      expect(stats.totalInvalidations).toBe(2);
    });

    it('按原因分类统计', () => {
      router.invalidate('k1', 'manual');
      router.invalidate('k2', 'ttl-expired');
      router.invalidate('k3', 'manual');
      const stats = router.getStats();
      expect(stats.byReason['manual']).toBe(2);
      expect(stats.byReason['ttl-expired']).toBe(1);
    });

    it('级联统计', () => {
      router.addDependency('child', ['parent']);
      router.invalidate('parent');
      const stats = router.getStats();
      expect(stats.cascadeInvalidations).toBe(1);
    });

    it('获取依赖图快照', () => {
      router.addDependency('a', ['b']);
      const graph = router.getDependencyGraph();
      expect(graph.length).toBe(2);
    });
  });

  describe('清理', () => {
    it('clear重置所有状态', () => {
      router.addDependency('a', ['b']);
      router.invalidate('a');
      router.clear();
      expect(router.getStats().totalInvalidations).toBe(0);
      expect(router.getDependencyGraph().length).toBe(0);
      expect(router.getHistory().length).toBe(0);
    });
  });

  describe('集成场景', () => {
    it('股票数据变更→行情衍生→指数级联失效', () => {
      // 模拟：stock:600519 被 quote:600519 依赖
      // quote:600519 被 index:sh000001 依赖
      router.addDependency('quote:600519', ['stock:600519']);
      router.addDependency('index:sh000001', ['quote:600519']);

      const result = router.invalidate('stock:600519', 'data-stale');
      expect(result).toEqual(['stock:600519', 'quote:600519', 'index:sh000001']);

      // 版本递增
      expect(router.getVersion('stock:600519')).toBe(1);
      expect(router.getVersion('quote:600519')).toBe(1);
      expect(router.getVersion('index:sh000001')).toBe(1);
    });

    it('批量更新多个股票后统一刷新指数', () => {
      router.addDependency('index:sh000001', ['stock:600519', 'stock:000858']);

      const invalidated = router.invalidateBatch(['stock:600519', 'stock:000858'], 'data-stale');
      expect(invalidated).toContain('stock:600519');
      expect(invalidated).toContain('stock:000858');
      // index可能被级联两次但去重
      const indexCount = invalidated.filter(k => k === 'index:sh000001').length;
      expect(indexCount).toBeGreaterThanOrEqual(1);
    });

    it('事件监听+延迟失效组合', async () => {
      const handler = vi.fn();
      router.on('data-stale', handler);

      router.scheduleDelayedInvalidation('key', 10, 'data-stale');
      await new Promise(r => setTimeout(r, 200));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
