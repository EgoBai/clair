/**
 * 技术分析图表标注逻辑测试
 * 覆盖趋势线、支撑阻力、形态标注
 */

import { describe, it, expect } from 'vitest';

describe('图表标注逻辑', () => {
  describe('趋势线计算', () => {
    interface Point { x: number; y: number; }

    function calcTrendLine(points: Point[]): { slope: number; intercept: number; r2: number } {
      const n = points.length;
      if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

      const sumX = points.reduce((s, p) => s + p.x, 0);
      const sumY = points.reduce((s, p) => s + p.y, 0);
      const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
      const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      const meanY = sumY / n;
      const ssTotal = points.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
      const ssResidual = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
      const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

      return { slope: Math.round(slope * 1000) / 1000, intercept: Math.round(intercept * 1000) / 1000, r2: Math.round(r2 * 1000) / 1000 };
    }

    it('线性数据应拟合完美', () => {
      const points: Point[] = [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }];
      const result = calcTrendLine(points);
      expect(result.slope).toBe(2);
      expect(result.intercept).toBe(1);
      expect(result.r2).toBe(1);
    });

    it('两个点应确定一条线', () => {
      const points: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
      const result = calcTrendLine(points);
      expect(result.slope).toBe(1);
    });
  });

  describe('支撑阻力位检测', () => {
    function findSupportResistance(prices: number[], tolerance: number = 0.02): { support: number[]; resistance: number[] } {
      const levels = new Map<number, number>();

      for (let i = 1; i < prices.length - 1; i++) {
        // Local minima = support
        if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) {
          const key = Math.round(prices[i] / (prices[i] * tolerance)) * (prices[i] * tolerance);
          levels.set(key, (levels.get(key) || 0) + 1);
        }
        // Local maxima = resistance
        if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
          const key = Math.round(prices[i] / (prices[i] * tolerance)) * (prices[i] * tolerance);
          levels.set(key, (levels.get(key) || 0) + 1);
        }
      }

      const sorted = Array.from(levels.entries()).sort((a, b) => b[1] - a[1]);
      const support: number[] = [];
      const resistance: number[] = [];
      const currentPrice = prices[prices.length - 1];

      for (const [level] of sorted.slice(0, 6)) {
        if (level < currentPrice) support.push(Math.round(level * 100) / 100);
        else resistance.push(Math.round(level * 100) / 100);
      }

      return { support: support.sort((a, b) => b - a), resistance: resistance.sort((a, b) => a - b) };
    }

    it('应能检测局部极值', () => {
      const prices = [10, 9, 8, 9, 10, 11, 10, 9, 10, 11, 12, 11];
      const result = findSupportResistance(prices);
      expect(result.support.length + result.resistance.length).toBeGreaterThan(0);
    });
  });

  describe('价格形态识别', () => {
    interface Candle {
      open: number;
      high: number;
      low: number;
      close: number;
    }

    function detectPattern(candles: Candle[]): string | null {
      if (candles.length < 3) return null;
      const [p2, p1, curr] = candles.slice(-3);

      // Three white soldiers
      if (curr.close > curr.open && p1.close > p1.open && p2.close > p2.open &&
          curr.close > p1.close && p1.close > p2.close) {
        return 'three_white_soldiers';
      }

      // Three black crows
      if (curr.close < curr.open && p1.close < p1.open && p2.close < p2.open &&
          curr.close < p1.close && p1.close < p2.close) {
        return 'three_black_crows';
      }

      // Morning star
      if (p2.close < p2.open && Math.abs(p1.close - p1.open) < Math.abs(p2.close - p2.open) * 0.3 &&
          curr.close > curr.open && curr.close > (p2.open + p2.close) / 2) {
        return 'morning_star';
      }

      return null;
    }

    it('三只乌鸦应被识别', () => {
      const candles: Candle[] = [
        { open: 12, high: 12.5, low: 11, close: 11 },
        { open: 11, high: 11.5, low: 10, close: 10 },
        { open: 10, high: 10.5, low: 9, close: 9 },
      ];
      expect(detectPattern(candles)).toBe('three_black_crows');
    });

    it('三白兵应被识别', () => {
      const candles: Candle[] = [
        { open: 10, high: 11, low: 9.5, close: 11 },
        { open: 11, high: 12, low: 10.5, close: 12 },
        { open: 12, high: 13, low: 11.5, close: 13 },
      ];
      expect(detectPattern(candles)).toBe('three_white_soldiers');
    });

    it('无形态应返回null', () => {
      const candles: Candle[] = [
        { open: 10, high: 11, low: 9, close: 10.5 },
        { open: 10.5, high: 11, low: 10, close: 10 },
        { open: 10, high: 10.5, low: 9.5, close: 10.2 },
      ];
      expect(detectPattern(candles)).toBeNull();
    });
  });

  describe('均线交叉标注', () => {
    function detectCrossover(shortMA: number[], longMA: number[]): ('golden' | 'death' | null)[] {
      const signals: ('golden' | 'death' | null)[] = [];
      for (let i = 1; i < Math.min(shortMA.length, longMA.length); i++) {
        if (shortMA[i - 1] <= longMA[i - 1] && shortMA[i] > longMA[i]) {
          signals.push('golden');
        } else if (shortMA[i - 1] >= longMA[i - 1] && shortMA[i] < longMA[i]) {
          signals.push('death');
        } else {
          signals.push(null);
        }
      }
      return signals;
    }

    it('金叉应被检测', () => {
      const short = [9, 9.5, 10.5];
      const long = [10, 10, 10];
      const signals = detectCrossover(short, long);
      expect(signals[1]).toBe('golden');
    });

    it('死叉应被检测', () => {
      const short = [11, 10.5, 9.5];
      const long = [10, 10, 10];
      const signals = detectCrossover(short, long);
      expect(signals[1]).toBe('death');
    });
  });
});
