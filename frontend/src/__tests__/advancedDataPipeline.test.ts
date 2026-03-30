import { describe, it, expect } from 'vitest';

// 高级数据管道引擎测试
describe('高级数据管道引擎', () => {
  describe('数据清洗管道', () => {
    function cleanData(data: (number | null | undefined)[]): number[] {
      return data.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
    }

    function interpolateGaps(data: (number | null)[]): number[] {
      const result: number[] = [...data] as number[];
      for (let i = 0; i < result.length; i++) {
        if (result[i] === null) {
          let prev = i - 1;
          while (prev >= 0 && result[prev] === null) prev--;
          let next = i + 1;
          while (next < result.length && result[next] === null) next++;
          if (prev >= 0 && next < result.length) {
            result[i] = result[prev] + (result[next] - result[prev]) * ((i - prev) / (next - prev));
          } else if (prev >= 0) {
            result[i] = result[prev];
          } else if (next < result.length) {
            result[i] = result[next];
          } else {
            result[i] = 0;
          }
        }
      }
      return result;
    }

    it('移除null值', () => {
      expect(cleanData([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
    });

    it('移除NaN值', () => {
      expect(cleanData([1, NaN, 2])).toEqual([1, 2]);
    });

    it('全null返回空', () => {
      expect(cleanData([null, null])).toHaveLength(0);
    });

    it('插值填补中间空值', () => {
      const result = interpolateGaps([1, null, 3]);
      expect(result[1]).toBe(2);
    });

    it('插值填补连续空值', () => {
      const result = interpolateGaps([0, null, null, 3]);
      expect(result[1]).toBe(1);
      expect(result[2]).toBe(2);
    });

    it('开头空值用下一个值填充', () => {
      const result = interpolateGaps([null, 5, 10]);
      expect(result[0]).toBe(5);
    });

    it('结尾空值用上一个值填充', () => {
      const result = interpolateGaps([5, 10, null]);
      expect(result[2]).toBe(10);
    });
  });

  describe('数据标准化管道', () => {
    function minMaxNormalize(data: number[]): number[] {
      const min = Math.min(...data);
      const max = Math.max(...data);
      if (max === min) return data.map(() => 0);
      return data.map(v => (v - min) / (max - min));
    }

    function robustScale(data: number[]): number[] {
      const sorted = [...data].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      if (iqr === 0) return data.map(() => 0);
      const median = sorted[Math.floor(sorted.length * 0.5)];
      return data.map(v => (v - median) / iqr);
    }

    it('归一化后范围[0,1]', () => {
      const result = minMaxNormalize([10, 20, 30, 40, 50]);
      expect(result[0]).toBe(0);
      expect(result[4]).toBe(1);
    });

    it('常数序列归一化为0', () => {
      expect(minMaxNormalize([5, 5, 5])).toEqual([0, 0, 0]);
    });

    it('Robust缩放对异常值不敏感', () => {
      const result = robustScale([1, 2, 3, 4, 1000]);
      expect(result[4]).toBeGreaterThan(10);
    });

    it('中位数的Robust缩放接近0', () => {
      const result = robustScale([1, 2, 3, 4, 5]);
      expect(result[2]).toBeCloseTo(0, 1);
    });
  });

  describe('数据聚合管道', () => {
    function aggregate(data: number[], windowSize: number, fn: (d: number[]) => number): number[] {
      const result: number[] = [];
      for (let i = 0; i <= data.length - windowSize; i++) {
        result.push(fn(data.slice(i, i + windowSize)));
      }
      return result;
    }

    function rollingMax(data: number[], window: number): number[] {
      return aggregate(data, window, d => Math.max(...d));
    }

    function rollingMin(data: number[], window: number): number[] {
      return aggregate(data, window, d => Math.min(...d));
    }

    function rollingSum(data: number[], window: number): number[] {
      return aggregate(data, window, d => d.reduce((a, b) => a + b, 0));
    }

    it('滚动最大值', () => {
      expect(rollingMax([1, 3, 2, 5, 4], 3)).toEqual([3, 5, 5]);
    });

    it('滚动最小值', () => {
      expect(rollingMin([3, 1, 4, 2, 5], 3)).toEqual([1, 1, 2]);
    });

    it('滚动求和', () => {
      expect(rollingSum([1, 2, 3, 4, 5], 3)).toEqual([6, 9, 12]);
    });

    it('窗口大于数据返回空', () => {
      expect(rollingMax([1, 2], 5)).toHaveLength(0);
    });

    it('窗口等于数据返回单个值', () => {
      expect(rollingSum([1, 2, 3], 3)).toEqual([6]);
    });
  });

  describe('时间序列重采样', () => {
    interface Tick { time: number; price: number; volume: number; }

    function resample(ticks: Tick[], interval: number): { time: number; open: number; high: number; low: number; close: number; volume: number }[] {
      if (ticks.length === 0) return [];
      const buckets = new Map<number, Tick[]>();
      for (const tick of ticks) {
        const bucketKey = Math.floor(tick.time / interval) * interval;
        if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
        buckets.get(bucketKey)!.push(tick);
      }
      return Array.from(buckets.entries()).map(([time, b]) => ({
        time,
        open: b[0].price,
        high: Math.max(...b.map(t => t.price)),
        low: Math.min(...b.map(t => t.price)),
        close: b[b.length - 1].price,
        volume: b.reduce((s, t) => s + t.volume, 0),
      })).sort((a, b) => a.time - b.time);
    }

    it('重采样为OHLC', () => {
      const ticks: Tick[] = [
        { time: 0, price: 10, volume: 100 },
        { time: 1, price: 12, volume: 200 },
        { time: 2, price: 9, volume: 150 },
      ];
      const result = resample(ticks, 10);
      expect(result).toHaveLength(1);
      expect(result[0].open).toBe(10);
      expect(result[0].high).toBe(12);
      expect(result[0].low).toBe(9);
      expect(result[0].close).toBe(9);
      expect(result[0].volume).toBe(450);
    });

    it('空数据返回空', () => {
      expect(resample([], 60)).toHaveLength(0);
    });

    it('跨区间数据分桶', () => {
      const ticks: Tick[] = [
        { time: 0, price: 10, volume: 100 },
        { time: 60, price: 20, volume: 200 },
        { time: 120, price: 30, volume: 300 },
      ];
      const result = resample(ticks, 60);
      expect(result).toHaveLength(3);
    });
  });

  describe('数据压缩', () => {
    function deltaEncode(data: number[]): number[] {
      if (data.length === 0) return [];
      const result = [data[0]];
      for (let i = 1; i < data.length; i++) result.push(data[i] - data[i - 1]);
      return result;
    }

    function deltaDecode(encoded: number[]): number[] {
      if (encoded.length === 0) return [];
      const result = [encoded[0]];
      for (let i = 1; i < encoded.length; i++) result.push(result[i - 1] + encoded[i]);
      return result;
    }

    it('编码后首元素不变', () => {
      expect(deltaEncode([100, 105, 103])[0]).toBe(100);
    });

    it('编码后为差值', () => {
      expect(deltaEncode([100, 105, 103])).toEqual([100, 5, -2]);
    });

    it('编码解码互逆', () => {
      const data = [10, 15, 12, 20, 18];
      expect(deltaDecode(deltaEncode(data))).toEqual(data);
    });

    it('空数组编解码', () => {
      expect(deltaEncode([])).toHaveLength(0);
      expect(deltaDecode([])).toHaveLength(0);
    });

    it('常数序列编码为零差值', () => {
      expect(deltaEncode([5, 5, 5, 5])).toEqual([5, 0, 0, 0]);
    });
  });

  describe('异常值检测', () => {
    function detectOutliers(data: number[], threshold = 2): { values: number[]; indices: number[] } {
      if (data.length < 2) return { values: [], indices: [] };
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
      if (std === 0) return { values: [], indices: [] };
      const values: number[] = [], indices: number[] = [];
      data.forEach((v, i) => {
        if (Math.abs(v - mean) / std > threshold) { values.push(v); indices.push(i); }
      });
      return { values, indices };
    }

    it('检测离群值', () => {
      const data = [1, 2, 1, 2, 1, 100, 2, 1];
      const result = detectOutliers(data);
      expect(result.values).toContain(100);
    });

    it('均匀数据无异常值', () => {
      expect(detectOutliers([5, 5, 5, 5, 5]).values).toHaveLength(0);
    });

    it('高阈值检测更少异常值', () => {
      const data = [1, 2, 1, 2, 5, 1, 2];
      expect(detectOutliers(data, 3).values.length).toBeLessThanOrEqual(detectOutliers(data, 1).values.length);
    });

    it('空数据返回空', () => {
      expect(detectOutliers([]).values).toHaveLength(0);
    });

    it('常数序列无异常值', () => {
      expect(detectOutliers([7, 7, 7, 7]).values).toHaveLength(0);
    });
  });
});
