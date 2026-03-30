import { describe, it, expect } from 'vitest';

// 高级图表计算引擎测试
describe('高级图表计算引擎', () => {
  describe('蜡烛图形态识别', () => {
    interface OHLC { open: number; high: number; low: number; close: number; }

    function bodySize(candle: OHLC): number {
      return Math.abs(candle.close - candle.open);
    }

    function upperShadow(candle: OHLC): number {
      return candle.high - Math.max(candle.open, candle.close);
    }

    function lowerShadow(candle: OHLC): number {
      return Math.min(candle.open, candle.close) - candle.low;
    }

    function isDoji(candle: OHLC, threshold = 0.001): boolean {
      const range = candle.high - candle.low;
      return range > 0 && bodySize(candle) / range < threshold;
    }

    function isHammer(candle: OHLC): boolean {
      const body = bodySize(candle);
      const lower = lowerShadow(candle);
      const upper = upperShadow(candle);
      return body > 0 && lower >= body * 2 && upper <= body * 0.5;
    }

    function isShootingStar(candle: OHLC): boolean {
      const body = bodySize(candle);
      const upper = upperShadow(candle);
      const lower = lowerShadow(candle);
      return body > 0 && upper >= body * 2 && lower <= body * 0.5;
    }

    function isEngulfing(prev: OHLC, curr: OHLC): 'bullish' | 'bearish' | null {
      const prevBullish = prev.close > prev.open;
      const currBullish = curr.close > curr.open;
      if (prevBullish && !currBullish && curr.open > prev.close && curr.close < prev.open) return 'bearish';
      if (!prevBullish && currBullish && curr.open < prev.close && curr.close > prev.open) return 'bullish';
      return null;
    }

    it('十字星识别', () => {
      expect(isDoji({ open: 10, high: 11, low: 9, close: 10.001 })).toBe(true);
    });

    it('大实体不是十字星', () => {
      expect(isDoji({ open: 10, high: 11, low: 9, close: 11 })).toBe(false);
    });

    it('锤子线识别', () => {
      expect(isHammer({ open: 10, high: 10.14, low: 8, close: 10.1 })).toBe(true);
    });

    it('上影线长不是锤子线', () => {
      expect(isHammer({ open: 10, high: 13, low: 9.8, close: 9.9 })).toBe(false);
    });

    it('流星线识别', () => {
      expect(isShootingStar({ open: 10, high: 12, low: 9.93, close: 9.95 })).toBe(true);
    });

    it('看涨吞没形态', () => {
      const prev: OHLC = { open: 10, high: 10.5, low: 9, close: 9.5 };
      const curr: OHLC = { open: 9, high: 11, low: 9, close: 11 };
      expect(isEngulfing(prev, curr)).toBe('bullish');
    });

    it('看跌吞没形态', () => {
      const prev: OHLC = { open: 9.5, high: 11, low: 9, close: 10.5 };
      const curr: OHLC = { open: 11, high: 11, low: 9, close: 9 };
      expect(isEngulfing(prev, curr)).toBe('bearish');
    });

    it('非吞没形态返回null', () => {
      const prev: OHLC = { open: 10, high: 11, low: 9, close: 10.5 };
      const curr: OHLC = { open: 10.2, high: 11, low: 10, close: 10.8 };
      expect(isEngulfing(prev, curr)).toBe(null);
    });

    it('实体大小计算', () => {
      expect(bodySize({ open: 10, high: 11, low: 9, close: 12 })).toBe(2);
    });

    it('上影线计算', () => {
      expect(upperShadow({ open: 10, high: 13, low: 9, close: 11 })).toBe(2);
    });

    it('下影线计算', () => {
      expect(lowerShadow({ open: 10, high: 11, low: 8, close: 9 })).toBe(1);
    });
  });

  describe('支撑阻力线计算', () => {
    function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
      const n = x.length;
      if (n === 0) return { slope: 0, intercept: 0, r2: 0 };
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
      const sumX2 = x.reduce((s, v) => s + v * v, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const yMean = sumY / n;
      const ssTotal = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
      const ssRes = y.reduce((s, v, i) => s + (v - (slope * x[i] + intercept)) ** 2, 0);
      const r2 = ssTotal === 0 ? 1 : 1 - ssRes / ssTotal;
      return { slope, intercept, r2 };
    }

    it('完美线性关系', () => {
      const x = [1, 2, 3, 4, 5];
      const y = x.map(v => 2 * v + 3);
      const result = linearRegression(x, y);
      expect(result.slope).toBeCloseTo(2, 5);
      expect(result.intercept).toBeCloseTo(3, 5);
      expect(result.r2).toBeCloseTo(1, 5);
    });

    it('空数据返回零', () => {
      expect(linearRegression([], [])).toEqual({ slope: 0, intercept: 0, r2: 0 });
    });

    it('水平线斜率为0', () => {
      const result = linearRegression([1, 2, 3], [5, 5, 5]);
      expect(result.slope).toBeCloseTo(0, 5);
    });

    it('R²在0-1之间', () => {
      const x = [1, 2, 3, 4, 5, 6];
      const y = [2, 4, 5, 4, 5, 7];
      const result = linearRegression(x, y);
      expect(result.r2).toBeGreaterThanOrEqual(0);
      expect(result.r2).toBeLessThanOrEqual(1);
    });
  });

  describe('K线聚合', () => {
    interface Tick { time: number; price: number; volume: number; }

    function aggregateTicks(ticks: Tick[], intervalMs: number): { time: number; open: number; high: number; low: number; close: number; volume: number }[] {
      const map = new Map<number, Tick[]>();
      for (const t of ticks) {
        const key = Math.floor(t.time / intervalMs) * intervalMs;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
      return Array.from(map.entries()).map(([time, t]) => ({
        time,
        open: t[0].price,
        high: Math.max(...t.map(x => x.price)),
        low: Math.min(...t.map(x => x.price)),
        close: t[t.length - 1].price,
        volume: t.reduce((s, x) => s + x.volume, 0),
      })).sort((a, b) => a.time - b.time);
    }

    it('聚合为OHLC', () => {
      const ticks: Tick[] = [
        { time: 0, price: 10, volume: 100 },
        { time: 500, price: 12, volume: 200 },
        { time: 1500, price: 11, volume: 150 },
      ];
      const result = aggregateTicks(ticks, 1000);
      expect(result).toHaveLength(2);
      expect(result[0].open).toBe(10);
      expect(result[0].high).toBe(12);
      expect(result[0].low).toBe(10);
      expect(result[0].close).toBe(12);
      expect(result[0].volume).toBe(300);
    });

    it('空tick返回空', () => {
      expect(aggregateTicks([], 1000)).toHaveLength(0);
    });

    it('排序正确', () => {
      const ticks: Tick[] = [
        { time: 2000, price: 15, volume: 100 },
        { time: 0, price: 10, volume: 100 },
        { time: 1000, price: 12, volume: 100 },
      ];
      const result = aggregateTicks(ticks, 1000);
      expect(result[0].time).toBe(0);
      expect(result[1].time).toBe(1000);
      expect(result[2].time).toBe(2000);
    });
  });

  describe('分时图数据处理', () => {
    function timePriceData(prices: number[], volumes: number[], startTime: number, interval: number): { time: number; price: number; volume: number; avgPrice: number }[] {
      let cumVol = 0, cumPV = 0;
      return prices.map((p, i) => {
        cumVol += volumes[i];
        cumPV += p * volumes[i];
        return {
          time: startTime + i * interval,
          price: p,
          volume: volumes[i],
          avgPrice: cumVol > 0 ? cumPV / cumVol : p,
        };
      });
    }

    it('均价递推正确', () => {
      const result = timePriceData([10, 12], [100, 100], 0, 60000);
      expect(result[1].avgPrice).toBeCloseTo(11, 5);
    });

    it('首根均价等于价格', () => {
      const result = timePriceData([10], [100], 0, 60000);
      expect(result[0].avgPrice).toBe(10);
    });

    it('时间戳递增', () => {
      const result = timePriceData([10, 11, 12], [100, 100, 100], 0, 60000);
      expect(result[1].time - result[0].time).toBe(60000);
    });

    it('空数据返回空', () => {
      expect(timePriceData([], [], 0, 60000)).toHaveLength(0);
    });
  });
});
