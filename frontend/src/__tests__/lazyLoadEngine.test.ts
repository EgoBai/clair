import { describe, it, expect, beforeEach } from 'vitest';
import { LazyLoadEngine } from '../utils/lazyLoadEngine';

describe('LazyLoadEngine', () => {
  let engine: LazyLoadEngine;

  beforeEach(() => {
    engine = new LazyLoadEngine();
  });

  describe('注册', () => {
    it('应该注册懒加载元素', () => {
      const state = engine.register('chart-1');
      expect(state.status).toBe('idle');
      expect(state.progress).toBe(0);
      expect(state.retryAttempt).toBe(0);
    });

    it('应该支持自定义配置', () => {
      const state = engine.register('chart-2', { priority: 'high', delay: 0 });
      expect(state.status).toBe('idle');
    });

    it('应该获取注册状态', () => {
      engine.register('chart-3');
      const state = engine.getState('chart-3');
      expect(state).toBeDefined();
      expect(state!.status).toBe('idle');
    });

    it('未注册元素应返回undefined', () => {
      expect(engine.getState('nonexistent')).toBeUndefined();
    });
  });

  describe('加载', () => {
    it('应该成功加载', async () => {
      engine.register('chart-1', { delay: 0 });
      const result = await engine.load('chart-1', async () => ({ data: [1, 2, 3] }));

      expect(result).toEqual({ data: [1, 2, 3] });
      const state = engine.getState('chart-1');
      expect(state!.status).toBe('loaded');
      expect(state!.progress).toBe(100);
    });

    it('应该处理加载错误', async () => {
      engine.register('chart-err', { delay: 0, retryCount: 0 });

      await expect(
        engine.load('chart-err', async () => { throw new Error('网络错误'); })
      ).rejects.toThrow('网络错误');

      const state = engine.getState('chart-err');
      expect(state!.status).toBe('error');
      expect(state!.error).toBe('网络错误');
    });

    it('未注册元素加载应抛出错误', async () => {
      await expect(
        engine.load('nonexistent', async () => ({}))
      ).rejects.toThrow();
    });

    it('应该支持重试', async () => {
      engine.register('chart-retry', { delay: 0, retryCount: 2, retryDelay: 1 });
      let attempts = 0;

      const result = await engine.load('chart-retry', async () => {
        attempts++;
        if (attempts < 3) throw new Error('临时错误');
        return { success: true };
      });

      expect(result).toEqual({ success: true });
      expect(attempts).toBe(3);
    });
  });

  describe('虚拟滚动', () => {
    it('应该计算可见窗口', () => {
      const window = engine.calculateVirtualWindow(1000, 500, 600, 40, 3);
      expect(window.start).toBeGreaterThanOrEqual(0);
      expect(window.end).toBeLessThan(1000);
      expect(window.end).toBeGreaterThan(window.start);
      expect(window.offsetY).toBe(window.start * 40);
    });

    it('应该处理顶部边界', () => {
      const window = engine.calculateVirtualWindow(100, 0, 400, 50, 2);
      expect(window.start).toBe(0);
    });

    it('应该处理底部边界', () => {
      const window = engine.calculateVirtualWindow(10, 500, 400, 50, 2);
      expect(window.end).toBeLessThanOrEqual(9);
    });

    it('应该包含overscan', () => {
      const window = engine.calculateVirtualWindow(100, 200, 200, 50, 5);
      const visibleCount = Math.ceil(200 / 50);
      expect(window.end - window.start + 1).toBeGreaterThanOrEqual(visibleCount);
    });
  });

  describe('批量预加载', () => {
    it('应该接收批量ID', () => {
      engine.register('a', { priority: 'high' });
      engine.register('b', { priority: 'low' });
      engine.batchPreload(['a', 'b']);
      // 不应抛出错误
    });
  });

  describe('状态管理', () => {
    it('应该重置单个状态', () => {
      engine.register('chart-1');
      engine.reset('chart-1');
      expect(engine.getState('chart-1')).toBeUndefined();
    });

    it('应该重置所有状态', () => {
      engine.register('a');
      engine.register('b');
      engine.reset();
      expect(engine.getState('a')).toBeUndefined();
      expect(engine.getState('b')).toBeUndefined();
    });

    it('应该获取状态摘要', () => {
      engine.register('a');
      engine.register('b');
      engine.register('c');

      const summary = engine.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.idle).toBe(3);
      expect(summary.loading).toBe(0);
      expect(summary.loaded).toBe(0);
      expect(summary.error).toBe(0);
    });

    it('摘要应该反映不同状态', async () => {
      engine.register('loaded', { delay: 0 });
      engine.register('idle');
      engine.register('error', { delay: 0, retryCount: 0 });

      await engine.load('loaded', async () => 'ok');
      try { await engine.load('error', async () => { throw new Error(); }); } catch (e) { void e; }

      const summary = engine.getSummary();
      expect(summary.loaded).toBe(1);
      expect(summary.idle).toBe(1);
      expect(summary.error).toBe(1);
    });
  });
});
