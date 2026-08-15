import { describe, it, expect, vi } from 'vitest';
import {
  sampleLTTB,
  sampleUniform,
  sampleAdaptive,
  sampleData,
  processInChunks,
  calculateVirtualRange,
  RenderProfiler,
  type KLineData,
} from '../utils/chartPerformance';

/**
 * 图表性能优化测试
 * LTTB / 均匀 / 自适应 采样、分块处理、虚拟列表、渲染性能监控
 * (Rewritten to import the real module functions.)
 */

function makeKLine(n: number): KLineData[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
    open: 100 + i,
    high: 100 + i + 1,
    low: 100 + i - 1,
    close: 100 + i,
    volume: 1000 + i,
  }));
}

describe('Chart Performance', () => {
  describe('sampleLTTB', () => {
    it('returns data unchanged when shorter than maxPoints', () => {
      const data = makeKLine(10);
      expect(sampleLTTB(data, 100)).toBe(data);
    });

    it('returns a slice when maxPoints < 3', () => {
      const data = makeKLine(10);
      const r = sampleLTTB(data, 2);
      expect(r).toHaveLength(2);
      expect(r).toEqual(data.slice(0, 2));
    });

    it('downsamples to exactly maxPoints and preserves first/last', () => {
      const data = makeKLine(1000);
      const r = sampleLTTB(data, 100);
      expect(r).toHaveLength(100);
      expect(r[0]).toBe(data[0]);
      expect(r[r.length - 1]).toBe(data[data.length - 1]);
    });
  });

  describe('sampleUniform', () => {
    it('returns data unchanged when shorter than maxPoints', () => {
      const data = makeKLine(10);
      expect(sampleUniform(data, 100)).toBe(data);
    });

    it('downsamples to maxPoints and preserves first point', () => {
      const data = makeKLine(1000);
      const r = sampleUniform(data, 100);
      expect(r).toHaveLength(100);
      expect(r[0]).toBe(data[0]);
    });
  });

  describe('sampleAdaptive', () => {
    it('reduces point count and preserves first point', () => {
      const data = makeKLine(1000);
      const r = sampleAdaptive(data, 100);
      expect(r.length).toBeLessThanOrEqual(101);
      expect(r.length).toBeLessThan(data.length);
      expect(r[0]).toBe(data[0]);
    });
  });

  describe('sampleData', () => {
    it('dispatches by strategy and defaults to lttb', () => {
      const data = makeKLine(1000);
      expect(sampleData(data, { maxPoints: 100, strategy: 'lttb' })).toHaveLength(100);
      expect(sampleData(data, { maxPoints: 100, strategy: 'uniform' })).toHaveLength(100);
      expect(sampleData(data, { maxPoints: 100, strategy: 'adaptive' }).length).toBeLessThanOrEqual(101);
      expect(sampleData(data, { maxPoints: 100 })).toHaveLength(100); // default
    });
  });

  describe('processInChunks', () => {
    it('processes all data and reports progress to 100', async () => {
      const data = Array.from({ length: 10 }, (_, i) => i + 1);
      const onProgress = vi.fn();
      const result = await processInChunks(data, 3, (chunk) => chunk.map(x => x * 2), onProgress);
      expect(result).toEqual(data.map(x => x * 2));
      expect(onProgress).toHaveBeenCalled();
      const last = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
      expect(last).toBe(100);
    });
  });

  describe('calculateVirtualRange', () => {
    it('computes visible window at scroll origin', () => {
      const range = calculateVirtualRange(1000, 500, 50, 0, 5);
      expect(range.start).toBe(0);
      expect(range.end).toBeLessThanOrEqual(1000);
      expect(range.offset).toBe(0);
    });

    it('accounts for scroll offset and overscan', () => {
      const range = calculateVirtualRange(1000, 500, 50, 500, 5);
      expect(range.start).toBe(5); // floor(500/50) - 5
      expect(range.offset).toBe(250);
      expect(range.end).toBe(25);
    });
  });

  describe('RenderProfiler', () => {
    it('measure returns the function result', () => {
      const profiler = new RenderProfiler();
      const result = profiler.measure('test', () => 42);
      expect(result).toBe(42);
    });

    it('end returns 0 for an unknown label', () => {
      const profiler = new RenderProfiler();
      expect(profiler.end('missing')).toBe(0);
    });
  });
});
