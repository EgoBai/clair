import { describe, it, expect } from 'vitest';

// 图表数据处理工具
interface DataPoint {
  x: number;
  y: number;
  label?: string;
}

interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
}

function normalizeData(data: number[], min?: number, max?: number): number[] {
  const dataMin = min ?? Math.min(...data);
  const dataMax = max ?? Math.max(...data);
  const range = dataMax - dataMin;
  if (range === 0) return data.map(() => 0.5);
  return data.map(v => (v - dataMin) / range);
}

function calculateMovingAverage(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function calculateBollingerBands(data: number[], period = 20, multiplier = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      middle.push(NaN);
      lower.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - avg) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      middle.push(avg);
      upper.push(avg + multiplier * std);
      lower.push(avg - multiplier * std);
    }
  }

  return { upper, middle, lower };
}

function interpolateData(data: (number | null)[], method: 'linear' | 'forward' = 'linear'): number[] {
  const result: number[] = [];
  let lastValidIdx = -1;

  for (let i = 0; i < data.length; i++) {
    if (data[i] !== null) {
      result.push(data[i]!);
      lastValidIdx = i;
    } else if (method === 'forward' && lastValidIdx >= 0) {
      result.push(result[lastValidIdx]);
    } else if (method === 'linear') {
      // 找下一个非null值
      let nextValidIdx = -1;
      for (let j = i + 1; j < data.length; j++) {
        if (data[j] !== null) { nextValidIdx = j; break; }
      }
      if (lastValidIdx >= 0 && nextValidIdx >= 0) {
        const ratio = (i - lastValidIdx) / (nextValidIdx - lastValidIdx);
        result.push(result[lastValidIdx] + (data[nextValidIdx]! - result[lastValidIdx]) * ratio);
      } else if (lastValidIdx >= 0) {
        result.push(result[lastValidIdx]);
      } else if (nextValidIdx >= 0) {
        result.push(data[nextValidIdx]!);
      } else {
        result.push(0);
      }
    } else {
      result.push(0);
    }
  }

  return result;
}

function calculateCorrelation(data1: number[], data2: number[]): number {
  if (data1.length !== data2.length || data1.length === 0) return 0;

  const n = data1.length;
  const mean1 = data1.reduce((a, b) => a + b, 0) / n;
  const mean2 = data2.reduce((a, b) => a + b, 0) / n;

  let cov = 0, std1 = 0, std2 = 0;
  for (let i = 0; i < n; i++) {
    const diff1 = data1[i] - mean1;
    const diff2 = data2[i] - mean2;
    cov += diff1 * diff2;
    std1 += diff1 ** 2;
    std2 += diff2 ** 2;
  }

  if (std1 === 0 || std2 === 0) return 0;
  return cov / Math.sqrt(std1 * std2);
}

function generateHeatmapData(data: number[][], colorScale: [string, string] = ['#f0f0f0', '#ff0000']): string[][] {
  const flat = data.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const range = max - min || 1;

  return data.map(row =>
    row.map(v => {
      const ratio = (v - min) / range;
      const r = Math.round(255 * ratio);
      const g = Math.round(255 * (1 - ratio) * 0.5);
      const b = Math.round(255 * (1 - ratio));
      return `rgb(${r},${g},${b})`;
    })
  );
}

function downsampleData(data: number[], targetLength: number): number[] {
  if (data.length <= targetLength) return [...data];
  const step = data.length / targetLength;
  const result: number[] = [];
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(Math.floor((i + 1) * step), start + 1);
    const slice = data.slice(start, end);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

describe('图表数据处理工具', () => {
  describe('normalizeData', () => {
    it('应该将数据归一化到0-1', () => {
      const result = normalizeData([10, 20, 30, 40, 50]);
      expect(result[0]).toBe(0);
      expect(result[4]).toBe(1);
      expect(result[2]).toBeCloseTo(0.5);
    });

    it('所有相同值应该返回0.5', () => {
      const result = normalizeData([5, 5, 5]);
      result.forEach(v => expect(v).toBe(0.5));
    });

    it('应该支持自定义min/max', () => {
      const result = normalizeData([5], 0, 10);
      expect(result[0]).toBeCloseTo(0.5);
    });

    it('单个元素数组', () => {
      expect(normalizeData([42])).toEqual([0.5]);
    });

    it('负数应该正确处理', () => {
      const result = normalizeData([-100, 0, 100]);
      expect(result[0]).toBe(0);
      expect(result[1]).toBeCloseTo(0.5);
      expect(result[2]).toBe(1);
    });
  });

  describe('calculateMovingAverage', () => {
    it('应该计算正确移动平均', () => {
      const result = calculateMovingAverage([1, 2, 3, 4, 5], 3);
      expect(result[0]).toBeNull();
      expect(result[1]).toBeNull();
      expect(result[2]).toBe(2);
      expect(result[3]).toBe(3);
      expect(result[4]).toBe(4);
    });

    it('period=1应该返回原值', () => {
      const result = calculateMovingAverage([10, 20, 30], 1);
      expect(result).toEqual([10, 20, 30]);
    });

    it('空数组应该返回空', () => {
      expect(calculateMovingAverage([], 3)).toEqual([]);
    });

    it('数据量等于period', () => {
      const result = calculateMovingAverage([1, 2, 3], 3);
      expect(result[2]).toBe(2);
    });
  });

  describe('calculateBollingerBands', () => {
    it('应该计算布林带', () => {
      const data = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 10);
      const bands = calculateBollingerBands(data, 20, 2);
      expect(bands.upper.length).toBe(30);
      expect(bands.middle.length).toBe(30);
      expect(bands.lower.length).toBe(30);

      // 上轨 > 中轨 > 下轨
      for (let i = 19; i < 30; i++) {
        expect(bands.upper[i]).toBeGreaterThan(bands.middle[i]);
        expect(bands.middle[i]).toBeGreaterThan(bands.lower[i]);
      }
    });

    it('数据不足时应该是NaN', () => {
      const data = [1, 2, 3];
      const bands = calculateBollingerBands(data, 20, 2);
      expect(isNaN(bands.upper[0])).toBe(true);
    });

    it('恒定值的布林带宽度应该为0', () => {
      const data = Array(30).fill(100);
      const bands = calculateBollingerBands(data, 20, 2);
      expect(bands.upper[29]).toBe(bands.lower[29]);
    });
  });

  describe('interpolateData', () => {
    it('应该线性插值', () => {
      const result = interpolateData([1, null, null, 4], 'linear');
      expect(result[0]).toBe(1);
      expect(result[3]).toBe(4);
      expect(result[1]).toBeCloseTo(2);
      expect(result[2]).toBeCloseTo(3);
    });

    it('应该前向填充', () => {
      const result = interpolateData([1, null, null, 4], 'forward');
      expect(result[0]).toBe(1);
      expect(result[1]).toBe(1);
      expect(result[2]).toBe(1);
      expect(result[3]).toBe(4);
    });

    it('全null应该返回0', () => {
      const result = interpolateData([null, null], 'linear');
      expect(result).toEqual([0, 0]);
    });

    it('没有null应该原样返回', () => {
      const result = interpolateData([1, 2, 3], 'linear');
      expect(result).toEqual([1, 2, 3]);
    });

    it('开头null应该用后续值填充', () => {
      const result = interpolateData([null, null, 5], 'linear');
      expect(result[0]).toBe(5);
    });

    it('末尾null应该用前值填充', () => {
      const result = interpolateData([5, null, null], 'linear');
      expect(result[1]).toBe(5);
      expect(result[2]).toBe(5);
    });
  });

  describe('calculateCorrelation', () => {
    it('完全正相关应该返回1', () => {
      const result = calculateCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
      expect(result).toBeCloseTo(1, 5);
    });

    it('完全负相关应该返回-1', () => {
      const result = calculateCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
      expect(result).toBeCloseTo(-1, 5);
    });

    it('无关数据应该接近0', () => {
      const result = calculateCorrelation([1, 1, 1, 1], [2, 3, 4, 5]);
      expect(result).toBe(0); // 方差为0
    });

    it('空数组应该返回0', () => {
      expect(calculateCorrelation([], [])).toBe(0);
    });

    it('长度不同应该返回0', () => {
      expect(calculateCorrelation([1, 2], [1])).toBe(0);
    });
  });

  describe('generateHeatmapData', () => {
    it('应该生成颜色矩阵', () => {
      const data = [[1, 2], [3, 4]];
      const colors = generateHeatmapData(data);
      expect(colors).toHaveLength(2);
      expect(colors[0]).toHaveLength(2);
      colors.forEach(row => row.forEach(c => {
        expect(c).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
      }));
    });

    it('最低值应该接近冷色', () => {
      const data = [[0, 100]];
      const colors = generateHeatmapData(data);
      expect(colors[0][0]).toMatch(/rgb\(0,/); // R=0 for lowest
    });

    it('最高值应该接近暖色', () => {
      const data = [[0, 100]];
      const colors = generateHeatmapData(data);
      expect(colors[0][1]).toMatch(/rgb\(255,/); // R=255 for highest
    });
  });

  describe('downsampleData', () => {
    it('应该减少数据点数量', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      const result = downsampleData(data, 100);
      expect(result).toHaveLength(100);
    });

    it('数据量小于目标应该原样返回', () => {
      const data = [1, 2, 3];
      const result = downsampleData(data, 10);
      expect(result).toEqual([1, 2, 3]);
    });

    it('应该保持数据趋势', () => {
      const data = Array.from({ length: 100 }, (_: any, i: number) => i);
      const result = downsampleData(data, 10);
      // 大致递增
      for (let i = 1; i < result.length; i++) {
        expect(result[i]).toBeGreaterThan(result[i - 1]);
      }
    });
  });
});
