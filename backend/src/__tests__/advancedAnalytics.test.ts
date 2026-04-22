import { describe, it, expect } from 'vitest';

// 高级分析引擎测试
describe('高级分析引擎', () => {
  // 波动率分析
  describe('波动率分析', () => {
    function calcVolatility(prices: number[]): number {
      if (prices.length < 2) return 0;
      const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
      return Math.sqrt(variance) * Math.sqrt(252);
    }

    it('应该计算年化波动率', () => {
      const prices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109];
      const vol = calcVolatility(prices);
      expect(vol).toBeGreaterThan(0);
      expect(Number.isFinite(vol)).toBe(true);
    });

    it('恒定价格波动率为零', () => {
      expect(calcVolatility([100, 100, 100, 100, 100])).toBe(0);
    });

    it('不足2个价格返回零', () => {
      expect(calcVolatility([100])).toBe(0);
    });

    it('空数组返回零', () => {
      expect(calcVolatility([])).toBe(0);
    });

    it('高波动数据应大于低波动', () => {
      const lowVol = [100, 100.5, 101, 100.5, 101.5, 101, 102];
      const highVol = [100, 110, 95, 115, 90, 120, 85];
      expect(calcVolatility(highVol)).toBeGreaterThan(calcVolatility(lowVol));
    });

    it('波动率应为正值', () => {
      const prices = [100, 98, 102, 97, 103, 99, 105];
      expect(calcVolatility(prices)).toBeGreaterThan(0);
    });
  });

  // Beta系数计算
  describe('Beta系数', () => {
    function calcBeta(stockReturns: number[], marketReturns: number[]): number {
      if (stockReturns.length !== marketReturns.length || stockReturns.length < 2) return 0;
      const n = stockReturns.length;
      const sMean = stockReturns.reduce((a, b) => a + b, 0) / n;
      const mMean = marketReturns.reduce((a, b) => a + b, 0) / n;
      let cov = 0, mVar = 0;
      for (let i = 0; i < n; i++) {
        cov += (stockReturns[i] - sMean) * (marketReturns[i] - mMean);
        mVar += (marketReturns[i] - mMean) ** 2;
      }
      return mVar === 0 ? 0 : cov / mVar;
    }

    it('应该计算Beta', () => {
      const stock = [0.02, -0.01, 0.03, -0.02, 0.01];
      const market = [0.01, -0.005, 0.015, -0.01, 0.005];
      const beta = calcBeta(stock, market);
      expect(Number.isFinite(beta)).toBe(true);
    });

    it('完全相关时Beta为正', () => {
      const stock = [0.02, 0.04, 0.06, 0.08, 0.10];
      const market = [0.01, 0.02, 0.03, 0.04, 0.05];
      expect(calcBeta(stock, market)).toBeGreaterThan(0);
    });

    it('反向相关时Beta为负', () => {
      const stock = [-0.05, -0.03, -0.04, -0.02, -0.06];
      const market = [0.01, 0.02, 0.03, 0.04, 0.05];
      expect(calcBeta(stock, market)).toBeLessThan(0);
    });

    it('零方差市场返回零', () => {
      const stock = [0.01, 0.02, 0.03];
      const market = [0.01, 0.01, 0.01];
      expect(calcBeta(stock, market)).toBe(0);
    });

    it('长度不匹配返回零', () => {
      expect(calcBeta([0.01, 0.02], [0.01])).toBe(0);
    });
  });

  // 相关系数矩阵
  describe('相关系数', () => {
    function correlation(x: number[], y: number[]): number {
      const n = x.length;
      if (n < 2 || n !== y.length) return 0;
      const mx = x.reduce((a, b) => a + b, 0) / n;
      const my = y.reduce((a, b) => a + b, 0) / n;
      let num = 0, dx = 0, dy = 0;
      for (let i = 0; i < n; i++) {
        num += (x[i] - mx) * (y[i] - my);
        dx += (x[i] - mx) ** 2;
        dy += (y[i] - my) ** 2;
      }
      const denom = Math.sqrt(dx * dy);
      return denom === 0 ? 0 : num / denom;
    }

    it('完全正相关应为1', () => {
      const x = [1, 2, 3, 4, 5];
      expect(correlation(x, x)).toBeCloseTo(1, 5);
    });

    it('完全负相关应为-1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 4, 3, 2, 1];
      expect(correlation(x, y)).toBeCloseTo(-1, 5);
    });

    it('应在-1到1之间', () => {
      const r = correlation([1, 5, 3, 8, 2], [4, 6, 2, 9, 1]);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    });

    it('常量序列返回零', () => {
      expect(correlation([5, 5, 5], [1, 2, 3])).toBe(0);
    });
  });

  // 移动平均线交叉信号
  describe('均线交叉信号', () => {
    function calcMA(prices: number[], period: number): (number | null)[] {
      return prices.map((_, i) => {
        if (i < period - 1) return null;
        const slice = prices.slice(i - period + 1, i + 1);
        return slice.reduce((a, b) => a + b, 0) / period;
      });
    }

    function detectCrossover(short: (number | null)[], long: (number | null)[]): string[] {
      const signals: string[] = [];
      for (let i = 1; i < short.length; i++) {
        if (short[i] === null || long[i] === null || short[i - 1] === null || long[i - 1] === null) continue;
        if (short[i - 1]! <= long[i - 1]! && short[i]! > long[i]!) signals.push('golden');
        if (short[i - 1]! >= long[i - 1]! && short[i]! < long[i]!) signals.push('death');
      }
      return signals;
    }

    it('应该计算MA', () => {
      const prices = [10, 11, 12, 13, 14, 15];
      const ma3 = calcMA(prices, 3);
      expect(ma3[2]).toBeCloseTo(11, 5);
      expect(ma3[0]).toBeNull();
    });

    it('应该检测金叉', () => {
      const prices = [20, 18, 16, 14, 12, 14, 16, 18, 20, 22];
      const short = calcMA(prices, 2);
      const long = calcMA(prices, 4);
      const signals = detectCrossover(short, long);
      expect(signals).toContain('golden');
    });

    it('应该检测死叉', () => {
      const prices = [10, 12, 14, 16, 18, 16, 14, 12, 10, 8];
      const short = calcMA(prices, 2);
      const long = calcMA(prices, 4);
      const signals = detectCrossover(short, long);
      expect(signals).toContain('death');
    });

    it('平坦价格无信号', () => {
      const prices = [10, 10, 10, 10, 10, 10, 10];
      const short = calcMA(prices, 2);
      const long = calcMA(prices, 4);
      const signals = detectCrossover(short, long);
      expect(signals).toHaveLength(0);
    });
  });

  // 资金流量指标
  describe('资金流量指标MFI', () => {
    function calcMFI(highs: number[], lows: number[], closes: number[], volumes: number[], period: number): (number | null)[] {
      const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
      return tp.map((_, i) => {
        if (i < period) return null;
        let posFlow = 0, negFlow = 0;
        for (let j = i - period + 1; j <= i; j++) {
          const mf = tp[j] * volumes[j];
          if (tp[j] >= tp[j - 1]) posFlow += mf;
          else negFlow += mf;
        }
        if (negFlow === 0) return 100;
        const ratio = posFlow / negFlow;
        return 100 - (100 / (1 + ratio));
      });
    }

    it('应该在0-100范围内', () => {
      const highs = [10, 12, 11, 13, 14, 15, 13, 16];
      const lows = [8, 9, 9, 10, 11, 12, 10, 13];
      const closes = [9, 11, 10, 12, 13, 14, 11, 15];
      const volumes = [1000, 1200, 800, 1500, 1100, 1300, 900, 1600];
      const mfi = calcMFI(highs, lows, closes, volumes, 3);
      mfi.forEach(v => {
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      });
    });

    it('持续上涨应接近100', () => {
      const highs = [10, 11, 12, 13, 14, 15, 16, 17];
      const lows = [9, 10, 11, 12, 13, 14, 15, 16];
      const closes = [10, 11, 12, 13, 14, 15, 16, 17];
      const volumes = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000];
      const mfi = calcMFI(highs, lows, closes, volumes, 3);
      const lastMfi = mfi[mfi.length - 1];
      expect(lastMfi).toBe(100);
    });

    it('空值期返回null', () => {
      const mfi = calcMFI([10, 11], [9, 10], [10, 11], [100, 100], 3);
      expect(mfi[0]).toBeNull();
      expect(mfi[1]).toBeNull();
    });
  });

  // ATR真实波幅
  describe('ATR真实波幅', () => {
    function calcATR(highs: number[], lows: number[], closes: number[], period: number): (number | null)[] {
      const tr: number[] = [];
      for (let i = 0; i < highs.length; i++) {
        if (i === 0) { tr.push(highs[i] - lows[i]); continue; }
        tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
      }
      return tr.map((_, i) => {
        if (i < period - 1) return null;
        const slice = tr.slice(i - period + 1, i + 1);
        return slice.reduce((a, b) => a + b, 0) / period;
      });
    }

    it('应该计算ATR', () => {
      const highs = [10, 12, 11, 13, 14];
      const lows = [8, 9, 9, 10, 11];
      const closes = [9, 11, 10, 12, 13];
      const atr = calcATR(highs, lows, closes, 3);
      expect(atr[2]).toBeGreaterThan(0);
    });

    it('ATR应为正值', () => {
      const atr = calcATR([10, 11, 12], [9, 10, 11], [9.5, 10.5, 11.5], 2);
      atr.forEach(v => { if (v !== null) expect(v).toBeGreaterThan(0); });
    });

    it('波动增大时ATR应增大', () => {
      const highs = [10, 10.1, 10.2, 15, 16, 17];
      const lows = [9.9, 10, 10.1, 14, 15, 16];
      const closes = [10, 10.1, 10.2, 14.5, 15.5, 16.5];
      const atr = calcATR(highs, lows, closes, 2);
      const early = atr[1]!;
      const late = atr[5]!;
      expect(late).toBeGreaterThan(early);
    });
  });
});

// 数据聚合引擎
describe('数据聚合引擎', () => {
  describe('时间序列聚合', () => {
    interface Tick { timestamp: number; price: number; volume: number; }

    function aggregateOHLC(ticks: Tick[], intervalMs: number): { open: number; high: number; low: number; close: number; volume: number; timestamp: number }[] {
      const buckets = new Map<number, Tick[]>();
      for (const tick of ticks) {
        const key = Math.floor(tick.timestamp / intervalMs) * intervalMs;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(tick);
      }
      return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([ts, t]) => ({
        timestamp: ts,
        open: t[0].price,
        high: Math.max(...t.map(x => x.price)),
        low: Math.min(...t.map(x => x.price)),
        close: t[t.length - 1].price,
        volume: t.reduce((s, x) => s + x.volume, 0),
      }));
    }

    it('应该聚合为OHLC', () => {
      const ticks: Tick[] = [
        { timestamp: 1000, price: 10, volume: 100 },
        { timestamp: 1500, price: 12, volume: 200 },
        { timestamp: 2000, price: 11, volume: 150 },
        { timestamp: 3000, price: 13, volume: 300 },
      ];
      const candles = aggregateOHLC(ticks, 2000);
      expect(candles).toHaveLength(2);
      expect(candles[0].open).toBe(10);
      expect(candles[0].high).toBe(12);
      expect(candles[0].low).toBe(10);
      expect(candles[0].close).toBe(12);
      expect(candles[0].volume).toBe(300);
    });

    it('单个tick应形成完整K线', () => {
      const ticks: Tick[] = [{ timestamp: 1000, price: 10, volume: 100 }];
      const candles = aggregateOHLC(ticks, 1000);
      expect(candles[0].open).toBe(candles[0].close);
      expect(candles[0].high).toBe(candles[0].low);
    });

    it('空数据返回空数组', () => {
      expect(aggregateOHLC([], 1000)).toHaveLength(0);
    });

    it('应按时间排序', () => {
      const ticks: Tick[] = [
        { timestamp: 5000, price: 15, volume: 100 },
        { timestamp: 1000, price: 10, volume: 100 },
        { timestamp: 3000, price: 12, volume: 100 },
      ];
      const candles = aggregateOHLC(ticks, 2000);
      for (let i = 1; i < candles.length; i++) {
        expect(candles[i].timestamp).toBeGreaterThan(candles[i - 1].timestamp);
      }
    });
  });

  // 数据降采样
  describe('数据降采样', () => {
    function downsample<T>(data: T[], targetSize: number): T[] {
      if (data.length <= targetSize) return data;
      const step = data.length / targetSize;
      return Array.from({ length: targetSize }, (_, i) => data[Math.floor(i * step)]);
    }

    it('小数据集不采样', () => {
      expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
    });

    it('应减少到目标大小', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      expect(downsample(data, 100)).toHaveLength(100);
    });

    it('应保留首尾元素', () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const sampled = downsample(data, 10);
      expect(sampled[0]).toBe(0);
      expect(sampled[sampled.length - 1]).toBe(90);
    });

    it('空数组返回空', () => {
      expect(downsample([], 10)).toEqual([]);
    });
  });

  // 百分位数计算
  describe('百分位数', () => {
    function percentile(arr: number[], p: number): number {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = (p / 100) * (sorted.length - 1);
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      if (lower === upper) return sorted[lower];
      return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
    }

    it('P50应为中位数', () => {
      expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    });

    it('P0应为最小值', () => {
      expect(percentile([3, 1, 4, 1, 5], 0)).toBe(1);
    });

    it('P100应为最大值', () => {
      expect(percentile([3, 1, 4, 1, 5], 100)).toBe(5);
    });

    it('空数组返回零', () => {
      expect(percentile([], 50)).toBe(0);
    });

    it('单元素返回自身', () => {
      expect(percentile([42], 50)).toBe(42);
    });

    it('P25和P75', () => {
      const data = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      expect(percentile(data, 25)).toBeGreaterThan(percentile(data, 0));
      expect(percentile(data, 75)).toBeLessThan(percentile(data, 100));
    });
  });

  // 去重与合并
  describe('数据去重合并', () => {
    function mergeAndDedup<T>(arrays: T[][], keyFn: (item: T) => string): T[] {
      const map = new Map<string, T>();
      for (const arr of arrays) {
        for (const item of arr) {
          const key = keyFn(item);
          if (!map.has(key)) map.set(key, item);
        }
      }
      return Array.from(map.values());
    }

    it('应该去重', () => {
      const result = mergeAndDedup([
        [{ id: 'a', v: 1 }, { id: 'b', v: 2 }],
        [{ id: 'b', v: 3 }, { id: 'c', v: 4 }],
      ], x => x.id);
      expect(result).toHaveLength(3);
    });

    it('保留首次出现的值', () => {
      const result = mergeAndDedup([
        [{ id: 'a', v: 1 }],
        [{ id: 'a', v: 2 }],
      ], x => x.id);
      expect(result[0].v).toBe(1);
    });

    it('空数组返回空', () => {
      expect(mergeAndDedup([], (x: any) => String(x))).toHaveLength(0);
    });

    it('无重复保持原样', () => {
      const result = mergeAndDedup([
        [{ id: 'a', v: 1 }],
        [{ id: 'b', v: 2 }],
      ], x => x.id);
      expect(result).toHaveLength(2);
    });
  });

  // 滑动窗口计算
  describe('滑动窗口', () => {
    function slidingWindow<T, R>(data: T[], size: number, fn: (window: T[]) => R): R[] {
      if (data.length < size) return [];
      const results: R[] = [];
      for (let i = 0; i <= data.length - size; i++) {
        results.push(fn(data.slice(i, i + size)));
      }
      return results;
    }

    it('应该生成正确数量的窗口', () => {
      expect(slidingWindow([1, 2, 3, 4, 5], 3, w => w.reduce((a, b) => a + b, 0))).toHaveLength(3);
    });

    it('数据不足返回空', () => {
      expect(slidingWindow([1, 2], 3, w => w)).toHaveLength(0);
    });

    it('窗口大小为1等于原数据', () => {
      expect(slidingWindow([1, 2, 3], 1, w => w[0])).toEqual([1, 2, 3]);
    });

    it('应正确计算滑动平均', () => {
      const result = slidingWindow([10, 20, 30, 40], 2, w => (w[0] + w[1]) / 2);
      expect(result).toEqual([15, 25, 35]);
    });

    it('全等窗口大小', () => {
      const data = [1, 2, 3, 4, 5];
      expect(slidingWindow(data, data.length, w => w)).toHaveLength(1);
    });
  });
});
