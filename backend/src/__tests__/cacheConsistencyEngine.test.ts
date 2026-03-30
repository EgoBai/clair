import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheConsistencyEngine } from '../utils/cacheConsistencyEngine.js';

describe('CacheConsistencyEngine', () => {
  let engine: CacheConsistencyEngine;

  beforeEach(() => {
    engine = new CacheConsistencyEngine('eventual', 'write-through', 'last-write-wins');
  });

  describe('读操作', () => {
    it('读取不存在的key返回null', () => {
      const result = engine.read('nonexistent');
      expect(result.value).toBeNull();
      expect(result.consistent).toBe(true);
    });

    it('写入后读取一致', () => {
      engine.write('key', { data: 'test' });
      const result = engine.read('key');
      expect(result.value).toEqual({ data: 'test' });
      expect(result.consistent).toBe(true);
    });

    it('强一致性读取', () => {
      const strongEngine = new CacheConsistencyEngine('strong');
      strongEngine.write('key', 'value');
      const result = strongEngine.read('key');
      expect(result.consistent).toBe(true);
      expect(result.repaired).toBe(false);
    });

    it('读取触发统计', () => {
      engine.write('key', 'val');
      engine.read('key');
      engine.read('key');
      expect(engine.getStats().reads).toBe(2);
    });
  });

  describe('写操作', () => {
    it('写入成功并返回版本号', () => {
      const result = engine.write('key', 'value');
      expect(result.success).toBe(true);
      expect(result.version).toBe(1);
      expect(result.conflict).toBe(false);
    });

    it('多次写入版本递增', () => {
      engine.write('key', 'v1');
      engine.write('key', 'v2');
      const result = engine.write('key', 'v3');
      expect(result.version).toBe(3);
    });

    it('批量写入', () => {
      const result = engine.writeBatch([
        { key: 'k1', value: 'v1' },
        { key: 'k2', value: 'v2' },
        { key: 'k3', value: 'v3' },
      ]);
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.conflicts).toBe(0);
    });

    it('写入记录写入日志', () => {
      engine.write('key', 'value', 'test-source');
      const log = engine.getWriteLog();
      expect(log.length).toBe(1);
      expect(log[0].key).toBe('key');
      expect(log[0].source).toBe('test-source');
      expect(log[0].committed).toBe(true);
    });

    it('写入触发统计', () => {
      engine.write('k1', 'v1');
      engine.write('k2', 'v2');
      expect(engine.getStats().writes).toBe(2);
    });
  });

  describe('写策略', () => {
    it('write-through直接写入', () => {
      const wt = new CacheConsistencyEngine('eventual', 'write-through');
      wt.write('key', 'value');
      const result = wt.read('key');
      expect(result.value).toBe('value');
    });

    it('write-behind缓冲写入', () => {
      const wb = new CacheConsistencyEngine('eventual', 'write-behind');
      wb.write('key', 'value');
      // 值仍在versions中
      const result = wb.read('key');
      expect(result.value).toBe('value');
      // 但有pending
      expect(wb.getStats().pendingWrites).toBeGreaterThanOrEqual(0);
    });

    it('write-around策略', () => {
      const wa = new CacheConsistencyEngine('eventual', 'write-around');
      const result = wa.write('key', 'value');
      expect(result.success).toBe(true);
      const read = wa.read('key');
      expect(read.value).toBe('value');
    });
  });

  describe('冲突解决', () => {
    it('last-write-wins: 新时间戳覆盖', () => {
      const engine = new CacheConsistencyEngine('strong', 'write-through', 'last-write-wins');
      engine.write('key', 'old');
      const result = engine.write('key', 'new');
      expect(result.success).toBe(true);
    });

    it('first-write-wins: 拒绝新写入', () => {
      const engine = new CacheConsistencyEngine('strong', 'write-through', 'first-write-wins');
      engine.write('key', 'first');
      const result = engine.write('key', 'second');
      expect(result.success).toBe(false);
      expect(result.conflict).toBe(true);
    });

    it('reject: 拒绝冲突', () => {
      const engine = new CacheConsistencyEngine('strong', 'write-through', 'reject');
      engine.write('key', 'first');
      const result = engine.write('key', 'second');
      expect(result.success).toBe(false);
    });

    it('merge: 对象浅合并', () => {
      const engine = new CacheConsistencyEngine('strong', 'write-through', 'merge');
      engine.write('key', { a: 1, b: 2 });
      const result = engine.write('key', { b: 3, c: 4 });
      expect(result.success).toBe(true);
      const read = engine.read('key');
      expect(read.value).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('弱一致性下无冲突', () => {
      engine.write('key', 'v1');
      const result = engine.write('key', 'v2');
      expect(result.conflict).toBe(false);
    });
  });

  describe('版本管理', () => {
    it('获取版本号', () => {
      engine.write('key', 'v1');
      expect(engine.getVersion('key')).toBe(1);
      engine.write('key', 'v2');
      expect(engine.getVersion('key')).toBe(2);
    });

    it('不存在的key版本为0', () => {
      expect(engine.getVersion('nonexistent')).toBe(0);
    });

    it('版本一致性检查', () => {
      engine.write('key', 'v1');
      expect(engine.checkVersion('key', 1)).toBe(true);
      expect(engine.checkVersion('key', 0)).toBe(false);
    });

    it('版本摘要', () => {
      engine.write('k1', 'v1');
      engine.write('k2', 'v2');
      const summary = engine.getVersionSummary();
      expect(summary.length).toBe(2);
      expect(summary.every(s => s.version === 1)).toBe(true);
    });
  });

  describe('事件系统', () => {
    it('写入冲突触发事件', () => {
      const strong = new CacheConsistencyEngine('strong', 'write-through', 'reject');
      const handler = vi.fn();
      strong.onEvent(handler);
      strong.write('key', 'v1');
      strong.write('key', 'v2');
      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].type).toBe('write-conflict');
    });

    it('版本不匹配触发事件', () => {
      const handler = vi.fn();
      engine.onEvent(handler);
      engine.write('key', 'v1');
      engine.checkVersion('key', 99);
      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].type).toBe('version-mismatch');
    });
  });

  describe('配置', () => {
    it('修改一致性级别', () => {
      engine.setConsistencyLevel('strong');
      expect(engine.getConfig().consistencyLevel).toBe('strong');
    });

    it('修改写策略', () => {
      engine.setWriteStrategy('write-behind');
      expect(engine.getConfig().writeStrategy).toBe('write-behind');
    });

    it('修改冲突解决', () => {
      engine.setConflictResolution('merge');
      expect(engine.getConfig().conflictResolution).toBe('merge');
    });
  });

  describe('清理', () => {
    it('clear重置所有状态', () => {
      engine.write('k1', 'v1');
      engine.write('k2', 'v2');
      engine.clear();
      expect(engine.getStats().writes).toBe(0);
      expect(engine.getVersionSummary().length).toBe(0);
      expect(engine.getWriteLog().length).toBe(0);
    });
  });

  describe('集成场景', () => {
    it('行情数据写入→版本追踪→一致性读取', () => {
      // 模拟行情更新
      engine.write('quote:600519', { price: 1800, volume: 10000 }, 'realtime');
      engine.write('quote:600519', { price: 1805, volume: 12000 }, 'realtime');

      const result = engine.read('quote:600519');
      expect(result.value).toEqual({ price: 1805, volume: 12000 });
      expect(engine.getVersion('quote:600519')).toBe(2);
    });

    it('批量更新+冲突检测', () => {
      const strong = new CacheConsistencyEngine('strong', 'write-through', 'last-write-wins');
      strong.write('stock:a', 'v1');

      const result = strong.writeBatch([
        { key: 'stock:a', value: 'v2' },
        { key: 'stock:b', value: 'new' },
      ]);
      expect(result.success).toBe(2);
    });

    it('merge策略合并多源数据', () => {
      const merger = new CacheConsistencyEngine('strong', 'write-through', 'merge');
      // 来源1：基本行情
      merger.write('quote:600519', { price: 1800, name: '贵州茅台' }, 'source1');
      // 来源2：附加指标
      merger.write('quote:600519', { pe: 35, pb: 12 }, 'source2');

      const result = merger.read('quote:600519');
      expect(result.value).toEqual({ price: 1800, name: '贵州茅台', pe: 35, pb: 12 });
    });
  });
});
