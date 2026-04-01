import { describe, it, expect } from 'vitest';

/**
 * 高级图表逻辑测试
 * 动画/响应式/数据降采样/缩放
 */

interface DataPoint { x: number; y: number; }
interface Viewport { xMin: number; xMax: number; yMin: number; yMax: number; }

function downsampleLTTB(data: DataPoint[], threshold: number): DataPoint[] {
  if (data.length <= threshold || threshold < 3) return data;
  const sampled: DataPoint[] = [data[0]];
  const bucketSize = (data.length - 2) / (threshold - 2);
  for (let i = 1; i < threshold - 1; i++) {
    const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);
    const nextRangeStart = Math.floor(i * bucketSize) + 1;
    const nextRangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);
    let avgX = 0, avgY = 0, count = 0;
    for (let j = nextRangeStart; j < nextRangeEnd; j++) { avgX += data[j].x; avgY += data[j].y; count++; }
    if (count > 0) { avgX /= count; avgY /= count; }
    let maxArea = -1, maxIdx = rangeStart;
    const prev = sampled[sampled.length - 1];
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((prev.x - avgX) * (data[j].y - prev.y) - (prev.x - data[j].x) * (avgY - prev.y));
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }
    sampled.push(data[maxIdx]);
  }
  sampled.push(data[data.length - 1]);
  return sampled;
}

function calculateVisibleRange(data: DataPoint[], viewport: Viewport): DataPoint[] {
  return data.filter(d => d.x >= viewport.xMin && d.x <= viewport.xMax && d.y >= viewport.yMin && d.y <= viewport.yMax);
}

function autoScaleY(data: DataPoint[], padding = 0.1): { yMin: number; yMax: number } {
  if (data.length === 0) return { yMin: 0, yMax: 1 };
  const ys = data.map(d => d.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  return { yMin: min - range * padding, yMax: max + range * padding };
}

function generateSmoothPath(data: DataPoint[]): string {
  if (data.length === 0) return '';
  if (data.length === 1) return `M${data[0].x},${data[0].y}`;
  let path = `M${data[0].x},${data[0].y}`;
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const cpx = (prev.x + curr.x) / 2;
    path += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  return path;
}

function calculateAxisTicks(min: number, max: number, count = 5): number[] {
  if (min >= max) return [min];
  const range = max - min;
  const roughStep = range / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const candidates = [1, 2, 5, 10];
  const step = candidates.find(c => c * mag >= roughStep)! * mag;
  const ticks: number[] = [];
  let tick = Math.ceil(min / step) * step;
  while (tick <= max) { ticks.push(parseFloat(tick.toFixed(10))); tick += step; }
  return ticks;
}

describe('高级图表逻辑', () => {
  const data: DataPoint[] = Array.from({ length: 100 }, (_, i) => ({ x: i, y: Math.sin(i * 0.1) * 100 }));

  describe('downsampleLTTB', () => {
    it('should reduce data points', () => {
      const result = downsampleLTTB(data, 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result[0]).toEqual(data[0]);
      expect(result[result.length - 1]).toEqual(data[data.length - 1]);
    });

    it('should return original for small threshold', () => {
      expect(downsampleLTTB(data, 2)).toEqual(data);
    });

    it('should return original if already small', () => {
      const small = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
      expect(downsampleLTTB(small, 10)).toEqual(small);
    });
  });

  describe('calculateVisibleRange', () => {
    it('should filter to viewport', () => {
      const visible = calculateVisibleRange(data, { xMin: 10, xMax: 20, yMin: -50, yMax: 50 });
      visible.forEach(d => {
        expect(d.x).toBeGreaterThanOrEqual(10);
        expect(d.x).toBeLessThanOrEqual(20);
      });
    });
  });

  describe('autoScaleY', () => {
    it('should add padding', () => {
      const scale = autoScaleY([{ x: 0, y: 10 }, { x: 1, y: 20 }]);
      expect(scale.yMin).toBeLessThan(10);
      expect(scale.yMax).toBeGreaterThan(20);
    });

    it('should handle empty data', () => {
      expect(autoScaleY([])).toEqual({ yMin: 0, yMax: 1 });
    });
  });

  describe('generateSmoothPath', () => {
    it('should start with M', () => {
      const path = generateSmoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
      expect(path).toMatch(/^M/);
      expect(path).toContain('C');
    });

    it('should handle empty', () => {
      expect(generateSmoothPath([])).toBe('');
    });
  });

  describe('calculateAxisTicks', () => {
    it('should generate evenly spaced ticks', () => {
      const ticks = calculateAxisTicks(0, 100, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      ticks.forEach(t => {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(100);
      });
    });

    it('should handle min >= max', () => {
      expect(calculateAxisTicks(10, 10)).toEqual([10]);
    });
  });
});
