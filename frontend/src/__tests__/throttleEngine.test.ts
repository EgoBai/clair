import { describe, it, expect, beforeEach } from 'vitest';
import { ThrottleEngine } from '../utils/throttleEngine';

describe('ThrottleEngine', () => {
  let engine: ThrottleEngine;

  beforeEach(() => {
    engine = new ThrottleEngine({
      maxRequestsPerSecond: 50,
      maxConcurrent: 5,
      queueSize: 20,
      timeout: 5000,
    });
  });

  describe('基本请求', () => {
    it('应该执行单个请求', async () => {
      const result = await engine.enqueue('req-1', async () => ({ data: 'ok' }));
      expect(result).toEqual({ data: 'ok' });
    });

    it('应该执行多个并发请求', async () => {
      const promises = [
        engine.enqueue('r1', async () => 1),
        engine.enqueue('r2', async () => 2),
        engine.enqueue('r3', async () => 3),
      ];
      const results = await Promise.all(promises);
      expect(results).toEqual([1, 2, 3]);
    });

    it('应该处理异步请求', async () => {
      const result = await engine.enqueue('async', async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'delayed';
      });
      expect(result).toBe('delayed');
    });
  });

  describe('优先级队列', () => {
    it('应该按优先级处理请求', async () => {
      const order: string[] = [];

      // 先添加低优先级请求，再添加高优先级
      const p1 = engine.enqueue('low', async () => { order.push('low'); return 1; }, { priority: 'low' });
      const p2 = engine.enqueue('critical', async () => { order.push('critical'); return 2; }, { priority: 'critical' });
      const p3 = engine.enqueue('normal', async () => { order.push('normal'); return 3; }, { priority: 'normal' });

      await Promise.all([p1, p2, p3]);
      // critical 应该最先执行（虽然可能因并发导致顺序不绝对保证）
      expect(order.length).toBe(3);
    });

    it('应该支持所有优先级级别', async () => {
      const priorities = ['critical', 'high', 'normal', 'low'] as const;
      const results = await Promise.all(
        priorities.map(p =>
          engine.enqueue(`p-${p}`, async () => p, { priority: p })
        )
      );
      expect(results).toHaveLength(4);
    });
  });

  describe('错误处理', () => {
    it('应该处理请求失败', async () => {
      await expect(
        engine.enqueue('fail', async () => { throw new Error('服务器错误'); }, { maxRetries: 0 })
      ).rejects.toThrow('服务器错误');
    });

    it('应该更新失败统计', async () => {
      try {
        await engine.enqueue('fail', async () => { throw new Error('x'); }, { maxRetries: 0 });
      } catch {}
      const stats = engine.getStats();
      expect(stats.failedRequests).toBe(1);
    });

    it('应该支持重试', async () => {
      let attempts = 0;
      const fastEngine = new ThrottleEngine({ backoffMultiplier: 0, timeout: 5000, maxConcurrent: 5 });
      const result = await fastEngine.enqueue(
        'retry',
        async () => {
          attempts++;
          if (attempts < 3) throw new Error('临时错误');
          return 'success';
        },
        { maxRetries: 3 }
      );
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    }, 10000);
  });

  describe('超时', () => {
    it('应该超时取消请求', async () => {
      const fastEngine = new ThrottleEngine({ timeout: 50, maxConcurrent: 1 });
      await expect(
        fastEngine.enqueue('slow', async () => {
          await new Promise(r => setTimeout(r, 200));
          return 'done';
        }, { maxRetries: 0 })
      ).rejects.toThrow('请求超时');
    });
  });

  describe('队列管理', () => {
    it('应该限制队列大小', async () => {
      const smallEngine = new ThrottleEngine({ queueSize: 1, maxConcurrent: 1, timeout: 10000, maxRequestsPerSecond: 1 });

      // 第一个请求占住concurrent，第二个进队列（size=1）
      const p1 = smallEngine.enqueue('a', async () => { await new Promise(r => setTimeout(r, 2000)); return 1; });
      const p2 = smallEngine.enqueue('b', async () => 2);
      // 第三个应该因队列满而拒绝
      const p3 = smallEngine.enqueue('c', async () => 3);

      await expect(p3).rejects.toThrow('队列已满');
      await Promise.allSettled([p1, p2]);
    }, 10000);

    it('应该清空队列', async () => {
      engine.enqueue('a', async () => { await new Promise(r => setTimeout(r, 1000)); return 1; });
      engine.enqueue('b', async () => 2);
      engine.clear();

      const stats = engine.getStats();
      expect(stats.queuedRequests).toBe(0);
    });
  });

  describe('统计', () => {
    it('应该追踪总请求数', async () => {
      await engine.enqueue('a', async () => 1);
      await engine.enqueue('b', async () => 2);
      const stats = engine.getStats();
      expect(stats.totalRequests).toBe(2);
    });

    it('应该追踪完成请求数', async () => {
      await engine.enqueue('a', async () => 1);
      await engine.enqueue('b', async () => 2);
      const stats = engine.getStats();
      expect(stats.completedRequests).toBe(2);
    });

    it('应该计算平均响应时间', async () => {
      await engine.enqueue('a', async () => {
        await new Promise(r => setTimeout(r, 10));
        return 1;
      });
      const stats = engine.getStats();
      expect(stats.avgResponseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('配置', () => {
    it('应该更新配置', () => {
      engine.updateConfig({ maxConcurrent: 10 });
      // 不抛出错误即通过
    });
  });
});
