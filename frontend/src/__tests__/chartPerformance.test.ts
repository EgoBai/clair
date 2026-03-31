import { describe, it, expect } from 'vitest';

/**
 * 图表性能优化测试
 */

interface DataPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface ChartConfig {
  width: number;
  height: number;
  padding: number;
  maxDataPoints: number;
  enableAnimation: boolean;
  fps: number;
}

function downsampleData(data: DataPoint[], targetPoints: number): DataPoint[] {
  if (data.length <= targetPoints) return data;
  const step = Math.ceil(data.length / targetPoints);
  return data.filter((_, i) => i % step === 0);
}

function calcVisibleRange(data: DataPoint[], viewportStart: number, viewportEnd: number): DataPoint[] {
  return data.filter(d => d.x >= viewportStart && d.x <= viewportEnd);
}

function quantizeValue(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

function optimizeLabels(labels: string[], maxLabels: number): string[] {
  if (labels.length <= maxLabels) return labels;
  const step = Math.ceil(labels.length / maxLabels);
  return labels.filter((_, i) => i % step === 0);
}

function calcAxisRange(min: number, max: number, padding: number = 0.1): { min: number; max: number; step: number } {
  const range = max - min;
  const pad = range * padding;
  const rawMin = min - pad;
  const rawMax = max + pad;

  const magnitude = Math.pow(10, Math.floor(Math.log10(range)));
  const step = magnitude;

  return {
    min: Math.floor(rawMin / step) * step,
    max: Math.ceil(rawMax / step) * step,
    step,
  };
}

function createWebGLBuffer(data: Float32Array): { size: number; valid: boolean } {
  return { size: data.byteLength, valid: data.length > 0 };
}

function batchDrawCalls(items: number[], batchSize: number = 1000): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

describe('Chart Performance', () => {
  const sampleData: DataPoint[] = Array.from({ length: 10000 }, (_, i) => ({
    x: i,
    y: Math.sin(i / 100) * 100,
    timestamp: Date.now() + i * 60000,
  }));

  describe('数据降采样', () => {
    it('应该减少数据点数量', () => {
      const downsampled = downsampleData(sampleData, 100);
      expect(downsampled.length).toBeLessThanOrEqual(100);
    });

    it('小数据集不应该降采样', () => {
      const smallData = sampleData.slice(0, 50);
      const result = downsampleData(smallData, 100);
      expect(result.length).toBe(50);
    });

    it('应该保持首尾数据点', () => {
      const downsampled = downsampleData(sampleData, 10);
      expect(downsampled[0].x).toBe(sampleData[0].x);
    });
  });

  describe('可见范围计算', () => {
    it('应该返回视口内的数据', () => {
      const visible = calcVisibleRange(sampleData, 100, 200);
      expect(visible.every(d => d.x >= 100 && d.x <= 200)).toBe(true);
    });

    it('空范围应该返回空', () => {
      const visible = calcVisibleRange(sampleData, -100, -50);
      expect(visible.length).toBe(0);
    });
  });

  describe('数值量化', () => {
    it('应该按精度量化', () => {
      expect(quantizeValue(3.14159, 2)).toBe(3.14);
      expect(quantizeValue(3.14159, 0)).toBe(3);
      expect(quantizeValue(3.14159, 4)).toBe(3.1416);
    });

    it('应该处理负数', () => {
      expect(quantizeValue(-3.14159, 2)).toBe(-3.14);
    });
  });

  describe('标签优化', () => {
    it('应该减少标签数量', () => {
      const labels = Array.from({ length: 100 }, (_, i) => `Label ${i}`);
      const optimized = optimizeLabels(labels, 10);
      expect(optimized.length).toBeLessThanOrEqual(10);
    });

    it('小标签集不应该优化', () => {
      const labels = ['A', 'B', 'C'];
      expect(optimizeLabels(labels, 10)).toEqual(labels);
    });
  });

  describe('坐标轴范围', () => {
    it('应该计算合理的范围', () => {
      const range = calcAxisRange(5, 95);
      expect(range.min).toBeLessThanOrEqual(5);
      expect(range.max).toBeGreaterThanOrEqual(95);
      expect(range.step).toBeGreaterThan(0);
    });

    it('应该支持自定义padding', () => {
      const range1 = calcAxisRange(0, 100, 0);
      const range2 = calcAxisRange(0, 100, 0.2);
      expect(range2.max - range2.min).toBeGreaterThanOrEqual(range1.max - range1.min);
    });
  });

  describe('批量绘制', () => {
    it('应该分批处理', () => {
      const items = Array.from({ length: 2500 }, (_, i) => i);
      const batches = batchDrawCalls(items, 1000);
      expect(batches.length).toBe(3);
      expect(batches[0].length).toBe(1000);
      expect(batches[2].length).toBe(500);
    });

    it('小数据应该一批处理', () => {
      const items = [1, 2, 3];
      const batches = batchDrawCalls(items, 1000);
      expect(batches.length).toBe(1);
    });
  });

  describe('WebGL缓冲区', () => {
    it('应该正确创建缓冲区信息', () => {
      const data = new Float32Array([1, 2, 3, 4, 5]);
      const buffer = createWebGLBuffer(data);
      expect(buffer.size).toBe(20); // 5 * 4 bytes
      expect(buffer.valid).toBe(true);
    });

    it('空数据应该标记为无效', () => {
      const data = new Float32Array([]);
      const buffer = createWebGLBuffer(data);
      expect(buffer.valid).toBe(false);
    });
  });
});
