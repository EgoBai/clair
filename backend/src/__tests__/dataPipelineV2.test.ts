import { describe, it, expect } from 'vitest';

describe('数据管道与ETL处理V2', () => {
  // 数据清洗
  const cleanData = (data: (number | null | undefined)[]) => {
    const valid = data.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
    const removed = data.length - valid.length;
    const fillForward = (arr: (number | null)[]): number[] => {
      const result: number[] = [];
      let last: number | null = null;
      for (const v of arr) {
        if (v !== null && !isNaN(v)) { last = v; result.push(v); }
        else if (last !== null) result.push(last);
        else result.push(0);
      }
      return result;
    };
    return { valid, removed, fillForward: fillForward(data as (number | null)[]) };
  };

  describe('数据清洗', () => {
    it('过滤null值', () => {
      const result = cleanData([1, null, 3, null, 5]);
      expect(result.valid).toEqual([1, 3, 5]);
      expect(result.removed).toBe(2);
    });
    it('过滤undefined', () => {
      const result = cleanData([1, undefined, 3]);
      expect(result.valid).toEqual([1, 3]);
    });
    it('过滤NaN', () => {
      const result = cleanData([1, NaN, 3]);
      expect(result.valid).toEqual([1, 3]);
    });
    it('前向填充', () => {
      const result = cleanData([1, null, null, 4]);
      expect(result.fillForward).toEqual([1, 1, 1, 4]);
    });
    it('空数组', () => {
      const result = cleanData([]);
      expect(result.valid).toEqual([]);
    });
    it('全为null', () => {
      const result = cleanData([null, null, null]);
      expect(result.valid).toEqual([]);
      expect(result.removed).toBe(3);
    });
  });

  // 异常值检测
  const detectOutliers = (data: number[], method: 'zscore' | 'iqr' = 'zscore', threshold = 2) => {
    if (data.length < 2) return { outliers: [], indices: [], cleaned: data };
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
    if (method === 'zscore') {
      const indices = data.map((v, i) => Math.abs((v - mean) / (std || 1)) > threshold ? i : -1).filter(i => i >= 0);
      const outliers = indices.map(i => data[i]);
      const cleaned = data.filter((_, i) => !indices.includes(i));
      return { outliers, indices, cleaned };
    }
    const sorted = [...data].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const indices = data.map((v, i) => (v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr) ? i : -1).filter(i => i >= 0);
    const outliers = indices.map(i => data[i]);
    const cleaned = data.filter((_, i) => !indices.includes(i));
    return { outliers, indices, cleaned };
  };

  describe('异常值检测', () => {
    it('Z-Score检测', () => {
      const data = [10, 11, 10, 12, 11, 10, 100, 11, 10];
      const result = detectOutliers(data, 'zscore', 2);
      expect(result.outliers).toContain(100);
    });
    it('IQR检测', () => {
      const data = [1, 2, 3, 4, 5, 100];
      const result = detectOutliers(data, 'iqr');
      expect(result.outliers.length).toBeGreaterThan(0);
    });
    it('无异常值', () => {
      const data = [10, 11, 10, 11, 10, 11];
      const result = detectOutliers(data, 'zscore', 2);
      expect(result.outliers.length).toBe(0);
    });
    it('数据不足', () => {
      const result = detectOutliers([1], 'zscore');
      expect(result.outliers).toEqual([]);
    });
    it('空数组', () => {
      const result = detectOutliers([], 'zscore');
      expect(result.outliers).toEqual([]);
    });
  });

  // 数据聚合
  const aggregateTimeSeries = (
    data: { timestamp: number; value: number }[],
    intervalMs: number,
    method: 'sum' | 'avg' | 'max' | 'min' | 'first' | 'last' = 'avg'
  ) => {
    const buckets: Record<number, number[]> = {};
    for (const d of data) {
      const bucket = Math.floor(d.timestamp / intervalMs) * intervalMs;
      if (!buckets[bucket]) buckets[bucket] = [];
      buckets[bucket].push(d.value);
    }
    return Object.entries(buckets).map(([t, values]) => {
      let value: number;
      switch (method) {
        case 'sum': value = values.reduce((a, b) => a + b, 0); break;
        case 'max': value = Math.max(...values); break;
        case 'min': value = Math.min(...values); break;
        case 'first': value = values[0]; break;
        case 'last': value = values[values.length - 1]; break;
        default: value = values.reduce((a, b) => a + b, 0) / values.length;
      }
      return { timestamp: Number(t), value, count: values.length };
    });
  };

  describe('数据聚合', () => {
    const data = [
      { timestamp: 0, value: 10 },
      { timestamp: 1000, value: 20 },
      { timestamp: 2000, value: 30 },
      { timestamp: 3000, value: 40 },
      { timestamp: 4000, value: 50 },
    ];

    it('平均聚合', () => {
      const result = aggregateTimeSeries(data, 2000, 'avg');
      expect(result.length).toBe(3);
      expect(result[0].value).toBe(15);
    });
    it('求和聚合', () => {
      const result = aggregateTimeSeries(data, 2000, 'sum');
      expect(result[0].value).toBe(30);
    });
    it('最大值聚合', () => {
      const result = aggregateTimeSeries(data, 2000, 'max');
      expect(result[0].value).toBe(20);
    });
    it('最小值聚合', () => {
      const result = aggregateTimeSeries(data, 2000, 'min');
      expect(result[0].value).toBe(10);
    });
    it('首值聚合', () => {
      const result = aggregateTimeSeries(data, 2000, 'first');
      expect(result[0].value).toBe(10);
    });
    it('末值聚合', () => {
      const result = aggregateTimeSeries(data, 2000, 'last');
      expect(result[0].value).toBe(20);
    });
    it('桶计数', () => {
      const result = aggregateTimeSeries(data, 2000, 'sum');
      expect(result[0].count).toBe(2);
    });
    it('空数据', () => {
      const result = aggregateTimeSeries([], 2000);
      expect(result).toEqual([]);
    });
  });

  // 数据重采样
  const resampleOHLCV = (data: { time: number; open: number; high: number; low: number; close: number; volume: number }[], factor: number) => {
    if (factor <= 1) return data;
    const result: typeof data = [];
    for (let i = 0; i < data.length; i += factor) {
      const chunk = data.slice(i, i + factor);
      if (chunk.length === 0) continue;
      result.push({
        time: chunk[0].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map(c => c.high)),
        low: Math.min(...chunk.map(c => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, c) => s + c.volume, 0),
      });
    }
    return result;
  };

  describe('数据重采样', () => {
    const data = [
      { time: 1, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      { time: 2, open: 101, high: 103, low: 100, close: 102, volume: 1500 },
      { time: 3, open: 102, high: 104, low: 101, close: 103, volume: 2000 },
      { time: 4, open: 103, high: 105, low: 102, close: 104, volume: 1200 },
    ];

    it('2倍重采样', () => {
      const result = resampleOHLCV(data, 2);
      expect(result.length).toBe(2);
      expect(result[0].open).toBe(100);
      expect(result[0].close).toBe(102);
      expect(result[0].high).toBe(103);
      expect(result[0].low).toBe(99);
    });
    it('成交量累加', () => {
      const result = resampleOHLCV(data, 2);
      expect(result[0].volume).toBe(2500);
    });
    it('因子为1不重采样', () => {
      const result = resampleOHLCV(data, 1);
      expect(result.length).toBe(4);
    });
    it('空数据', () => {
      expect(resampleOHLCV([], 2)).toEqual([]);
    });
    it('因子大于数据量', () => {
      const result = resampleOHLCV(data, 10);
      expect(result.length).toBe(1);
    });
  });

  // 数据标准化
  const normalize = (data: number[], method: 'minmax' | 'zscore' = 'minmax') => {
    if (data.length === 0) return [];
    if (method === 'minmax') {
      const min = Math.min(...data);
      const max = Math.max(...data);
      const range = max - min;
      return range === 0 ? data.map(() => 0.5) : data.map(v => (v - min) / range);
    }
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
    return std === 0 ? data.map(() => 0) : data.map(v => (v - mean) / std);
  };

  describe('数据标准化', () => {
    it('Min-Max标准化', () => {
      const result = normalize([10, 20, 30], 'minmax');
      expect(result[0]).toBe(0);
      expect(result[2]).toBe(1);
      expect(result[1]).toBe(0.5);
    });
    it('Z-Score标准化', () => {
      const result = normalize([10, 20, 30], 'zscore');
      expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 5);
    });
    it('相同值处理', () => {
      const result = normalize([5, 5, 5], 'minmax');
      expect(result.every(v => v === 0.5)).toBe(true);
    });
    it('空数组', () => {
      expect(normalize([])).toEqual([]);
    });
    it('Z-Score相同值', () => {
      const result = normalize([5, 5, 5], 'zscore');
      expect(result.every(v => v === 0)).toBe(true);
    });
  });

  // 数据差异对比
  const diffDatasets = (a: Record<string, unknown>[], b: Record<string, unknown>[], key: string) => {
    const mapA = new Map(a.map(item => [item[key], item]));
    const mapB = new Map(b.map(item => [item[key], item]));
    const added = b.filter(item => !mapA.has(item[key]));
    const removed = a.filter(item => !mapB.has(item[key]));
    const modified = a.filter(item => {
      const bItem = mapB.get(item[key]);
      return bItem && JSON.stringify(item) !== JSON.stringify(bItem);
    });
    return { added, removed, modified, unchanged: a.length - removed.length - modified.length };
  };

  describe('数据差异对比', () => {
    it('检测新增', () => {
      const a = [{ id: 1, name: 'A' }];
      const b = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
      const result = diffDatasets(a, b, 'id');
      expect(result.added.length).toBe(1);
    });
    it('检测删除', () => {
      const a = [{ id: 1 }, { id: 2 }];
      const b = [{ id: 1 }];
      const result = diffDatasets(a, b, 'id');
      expect(result.removed.length).toBe(1);
    });
    it('检测修改', () => {
      const a = [{ id: 1, v: 'old' }];
      const b = [{ id: 1, v: 'new' }];
      const result = diffDatasets(a, b, 'id');
      expect(result.modified.length).toBe(1);
    });
    it('无变化', () => {
      const a = [{ id: 1, v: 'same' }];
      const b = [{ id: 1, v: 'same' }];
      const result = diffDatasets(a, b, 'id');
      expect(result.unchanged).toBe(1);
    });
    it('空数据集', () => {
      const result = diffDatasets([], [{ id: 1 }], 'id');
      expect(result.added.length).toBe(1);
      expect(result.removed.length).toBe(0);
    });
  });
});
