import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startRouteTransition,
  endRouteTransition,
  getRouteMetrics,
  getAvgRouteDuration,
  measureComponentLoad,
  measureAsync,
} from '../utils/routePerformance';

describe('routePerformance', () => {
  describe('startRouteTransition / endRouteTransition', () => {
    it('endRouteTransition在未start时不报错', () => {
      expect(() => endRouteTransition('/test')).not.toThrow();
    });

    it('start后end应增加指标计数', () => {
      const before = getRouteMetrics().length;
      startRouteTransition('/stocks');
      // Small delay to ensure duration > 0
      const start = Date.now();
      while (Date.now() - start < 2) { /* busy wait */ }
      endRouteTransition('/stocks');
      const after = getRouteMetrics().length;
      expect(after).toBe(before + 1);
    });
  });

  describe('getRouteMetrics', () => {
    it('应返回数组', () => {
      const metrics = getRouteMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('返回指标副本（不直接暴露内部数组）', () => {
      const m1 = getRouteMetrics();
      const m2 = getRouteMetrics();
      expect(m1).not.toBe(m2);
      expect(m1.length).toBe(m2.length);
    });

    it('指标包含必要字段', () => {
      startRouteTransition('/detail');
      const start = Date.now();
      while (Date.now() - start < 2) { /* busy wait */ }
      endRouteTransition('/detail');
      const metrics = getRouteMetrics();
      const last = metrics[metrics.length - 1];
      expect(last).toHaveProperty('from');
      expect(last).toHaveProperty('to');
      expect(last).toHaveProperty('duration');
      expect(last).toHaveProperty('timestamp');
      expect(last.to).toBe('/detail');
      expect(last.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAvgRouteDuration', () => {
    it('返回非负数', () => {
      const avg = getAvgRouteDuration();
      expect(typeof avg).toBe('number');
      expect(avg).toBeGreaterThanOrEqual(0);
    });

    it('有指标时返回正数平均', () => {
      startRouteTransition('/avg-test');
      const start = Date.now();
      while (Date.now() - start < 2) { /* busy wait */ }
      endRouteTransition('/avg-test');
      const avg = getAvgRouteDuration();
      expect(avg).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureComponentLoad', () => {
    it('应执行回调函数', () => {
      const fn = vi.fn();
      measureComponentLoad('TestComponent', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('不抛异常', () => {
      expect(() => measureComponentLoad('Test', () => {})).not.toThrow();
    });

    it('回调异常时应传播', () => {
      expect(() => measureComponentLoad('Err', () => { throw new Error('boom'); })).toThrow('boom');
    });
  });

  describe('measureAsync', () => {
    it('应返回Promise结果', async () => {
      const result = await measureAsync('test', async () => 42);
      expect(result).toBe(42);
    });

    it('失败时应重新抛出错误', async () => {
      await expect(
        measureAsync('fail', async () => { throw new Error('test error'); })
      ).rejects.toThrow('test error');
    });

    it('支持泛型类型', async () => {
      const result = await measureAsync('typed', async () => ({ data: 'hello' }));
      expect(result).toEqual({ data: 'hello' });
    });
  });
});
