/**
 * 图表性能工具扩展测试
 */
import { describe, it, expect } from 'vitest';
import {
  sampleLTTB,
  sampleUniform,
  sampleAdaptive,
  sampleData,
  calculateVirtualRange,
  RenderProfiler,
  processInChunks,
} from '../utils/chartPerformance';

function generateKLine(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: 100 + Math.sin(i * 0.1) * 10,
    high: 105 + Math.sin(i * 0.1) * 10,
    low: 95 + Math.sin(i * 0.1) * 10,
    close: 100 + Math.sin(i * 0.1) * 10,
    volume: 10000 + i * 100,
  }));
}

describe('图表性能工具扩展', () => {
  describe('LTTB 采样', () => {
    it('数据量小于目标应原样返回', () => {
      const data = generateKLine(50);
      expect(sampleLTTB(data, 100)).toHaveLength(50);
    });

    it('应始终保留首尾点', () => {
      const data = generateKLine(200);
      const result = sampleLTTB(data, 20);
      expect(result[0]).toBe(data[0]);
      expect(result[result.length - 1]).toBe(data[data.length - 1]);
    });

    it('maxPoints < 3 截断返回', () => {
      const data = generateKLine(100);
      expect(sampleLTTB(data, 2).length).toBeLessThanOrEqual(2);
    });

    it('大数据量 100ms 内完成', () => {
      const data = generateKLine(5000);
      const start = performance.now();
      sampleLTTB(data, 500);
      expect(performance.now() - start).toBeLessThan(100);
    });
  });

  describe('均匀采样', () => {
    it('应接近目标数量', () => {
      const data = generateKLine(1000);
      expect(sampleUniform(data, 50).length).toBeLessThanOrEqual(50);
    });

    it('空数组应返回空', () => {
      expect(sampleUniform([], 10)).toHaveLength(0);
    });
  });

  describe('自适应采样', () => {
    it('应返回采样结果', () => {
      const data = generateKLine(500);
      expect(sampleAdaptive(data, 100).length).toBeLessThanOrEqual(100);
    });

    it('小数据量应原样返回', () => {
      const data = generateKLine(10);
      expect(sampleAdaptive(data, 100).length).toBe(10);
    });
  });

  describe('sampleData 入口', () => {
    it('LTTB 策略', () => {
      const data = generateKLine(200);
      const result = sampleData(data, { maxPoints: 50, strategy: 'lttb' });
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('uniform 策略', () => {
      const data = generateKLine(200);
      const result = sampleData(data, { maxPoints: 50, strategy: 'uniform' });
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('adaptive 策略', () => {
      const data = generateKLine(200);
      const result = sampleData(data, { maxPoints: 50, strategy: 'adaptive' });
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe('虚拟列表范围', () => {
    it('应正确计算可见范围', () => {
      const range = calculateVirtualRange(500, 500, 50, 0);
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(500);
    });

    it('滚动后应更新范围', () => {
      const range1 = calculateVirtualRange(500, 500, 50, 0);
      const range2 = calculateVirtualRange(500, 500, 50, 250);
      expect(range2.start).toBeGreaterThanOrEqual(range1.start);
    });

    it('底部边界不超过总长度', () => {
      const range = calculateVirtualRange(100, 500, 50, 2000);
      expect(range.end).toBeLessThanOrEqual(100);
    });

    it('offset 应正确计算', () => {
      const range = calculateVirtualRange(100, 500, 50, 0);
      expect(range.offset).toBe(range.start * 50);
    });
  });

  describe('RenderProfiler', () => {
    it('应记录测量耗时', () => {
      const profiler = new RenderProfiler();
      const result = profiler.measure('test', () => {
        let sum = 0;
        for (let i = 0; i < 100; i++) sum += i;
        return sum;
      });
      expect(result).toBe(4950);
    });

    it('start/end 应记录耗时', () => {
      const profiler = new RenderProfiler();
      profiler.start('test');
      const elapsed = profiler.end('test');
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it('未 start 的 end 应返回 0', () => {
      const profiler = new RenderProfiler();
      expect(profiler.end('nonexistent')).toBe(0);
    });
  });

  describe('processInChunks', () => {
    it('应分块处理数据', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const result = await processInChunks(data, 25, (chunk) => chunk.map(n => n * 2));
      expect(result).toHaveLength(100);
      expect(result[0]).toBe(0);
      expect(result[99]).toBe(198);
    });

    it('空数组应返回空', async () => {
      const result = await processInChunks([], 10, (chunk) => chunk);
      expect(result).toHaveLength(0);
    });

    it('应报告进度', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const progressValues: number[] = [];
      await processInChunks(data, 25, (chunk) => chunk, (p) => progressValues.push(p));
      expect(progressValues.length).toBeGreaterThan(0);
    });
  });
});
