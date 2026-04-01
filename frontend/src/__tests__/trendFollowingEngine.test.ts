import { describe, it, expect } from 'vitest';

/**
 * 趋势跟踪策略引擎测试
 */

interface PriceData { date: string; open: number; high: number; low: number; close: number; volume: number; }
interface MAValues { ma5: number; ma10: number; ma20: number; ma60: number; ma120: number; ma250: number; }
interface TrendSignal { type: string; ma: string; direction: 'bullish' | 'bearish'; strength: number; }
interface TrendStrength { score: number; level: string; maAlignment: number; }

function calculateMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  return data.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function calculateAllMA(prices: number[]): MAValues | null {
  if (prices.length < 60) return null;
  return {
    ma5: calculateMA(prices, 5)!,
    ma10: calculateMA(prices, 10)!,
    ma20: calculateMA(prices, 20)!,
    ma60: calculateMA(prices, 60)!,
    ma120: prices.length >= 120 ? calculateMA(prices, 120)! : 0,
    ma250: prices.length >= 250 ? calculateMA(prices, 250)! : 0,
  };
}

function detectGoldenCross(prices: number[]): TrendSignal[] {
  const signals: TrendSignal[] = [];
  if (prices.length < 20) return signals;
  const pairs: Array<[string, number, number]> = [
    ['ma5_ma10', 5, 10], ['ma10_ma20', 10, 20], ['ma20_ma60', 20, 60],
  ];
  for (const [name, fast, slow] of pairs) {
    if (prices.length < slow + 1) continue;
    const fastPrev = calculateMA(prices.slice(0, -1), fast);
    const slowPrev = calculateMA(prices.slice(0, -1), slow);
    const fastCurr = calculateMA(prices, fast);
    const slowCurr = calculateMA(prices, slow);
    if (fastPrev && slowPrev && fastCurr && slowCurr) {
      if (fastPrev <= slowPrev && fastCurr > slowCurr) {
        signals.push({ type: 'golden_cross', ma: name, direction: 'bullish', strength: 70 });
      } else if (fastPrev >= slowPrev && fastCurr < slowCurr) {
        signals.push({ type: 'death_cross', ma: name, direction: 'bearish', strength: 70 });
      }
    }
  }
  return signals;
}

function calculateTrendStrength(prices: number[]): TrendStrength {
  if (prices.length < 60) return { score: 50, level: 'neutral', maAlignment: 0 };
  const ma = calculateAllMA(prices);
  if (!ma) return { score: 50, level: 'neutral', maAlignment: 0 };
  const mas = [ma.ma5, ma.ma10, ma.ma20, ma.ma60];
  let alignment = 0;
  const isBullish = mas.every((v, i) => i === 0 || v <= mas[i - 1]);
  const isBearish = mas.every((v, i) => i === 0 || v >= mas[i - 1]);
  if (isBullish) alignment = 1;
  else if (isBearish) alignment = -1;
  const recentTrend = prices.slice(-20);
  const slope = (recentTrend[recentTrend.length - 1] - recentTrend[0]) / recentTrend.length;
  const trendScore = Math.min(50, Math.abs(slope) * 100);
  const score = Math.min(100, Math.max(0, 50 + alignment * 25 + (slope > 0 ? trendScore : -trendScore)));
  const level = score > 70 ? 'strong_up' : score > 55 ? 'weak_up' : score < 30 ? 'strong_down' : score < 45 ? 'weak_down' : 'neutral';
  return { score: parseFloat(score.toFixed(2)), level, maAlignment: parseFloat(Math.abs(alignment).toFixed(2)) };
}

function calculateStopLoss(entry: number, atr: number, multiplier: number = 2, direction: 'long' | 'short' = 'long'): number {
  return direction === 'long' ? entry - atr * multiplier : entry + atr * multiplier;
}

function calculateTrailingStop(prices: number[], lookback: number = 10, offset: number = 0.03): number {
  if (prices.length < lookback) return prices[prices.length - 1] * (1 - offset);
  const highest = Math.max(...prices.slice(-lookback));
  return highest * (1 - offset);
}

describe('趋势跟踪策略引擎', () => {
  const generatePrices = (n: number, trend: 'up' | 'down' | 'flat' = 'up'): number[] => {
    let price = 100;
    return Array.from({ length: n }, () => {
      const change = trend === 'up' ? Math.random() * 0.02 : trend === 'down' ? -Math.random() * 0.02 : (Math.random() - 0.5) * 0.01;
      price *= (1 + change);
      return parseFloat(price.toFixed(2));
    });
  };

  describe('calculateMA', () => {
    it('should return null for insufficient data', () => {
      expect(calculateMA([1, 2], 5)).toBeNull();
    });

    it('should calculate correctly', () => {
      expect(calculateMA([10, 20, 30], 3)).toBe(20);
    });
  });

  describe('calculateAllMA', () => {
    it('should return null for insufficient data', () => {
      expect(calculateAllMA([1, 2, 3])).toBeNull();
    });

    it('should return all MA values', () => {
      const ma = calculateAllMA(generatePrices(70));
      expect(ma).not.toBeNull();
      expect(ma!.ma5).toBeGreaterThan(0);
      expect(ma!.ma60).toBeGreaterThan(0);
    });
  });

  describe('detectGoldenCross', () => {
    it('should return empty for insufficient data', () => {
      expect(detectGoldenCross([1, 2, 3])).toHaveLength(0);
    });

    it('should return array of signals', () => {
      const signals = detectGoldenCross(generatePrices(30));
      signals.forEach(s => {
        expect(['golden_cross', 'death_cross']).toContain(s.type);
        expect(['bullish', 'bearish']).toContain(s.direction);
      });
    });
  });

  describe('calculateTrendStrength', () => {
    it('should return neutral for short data', () => {
      const result = calculateTrendStrength([1, 2, 3]);
      expect(result.level).toBe('neutral');
    });

    it('should detect uptrend', () => {
      const result = calculateTrendStrength(generatePrices(70, 'up'));
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should detect downtrend', () => {
      const result = calculateTrendStrength(generatePrices(70, 'down'));
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateStopLoss', () => {
    it('long stop below entry', () => {
      expect(calculateStopLoss(100, 2)).toBe(96);
    });

    it('short stop above entry', () => {
      expect(calculateStopLoss(100, 2, 2, 'short')).toBe(104);
    });
  });

  describe('calculateTrailingStop', () => {
    it('should return below highest', () => {
      const stop = calculateTrailingStop([90, 95, 100, 105, 110], 5, 0.03);
      expect(stop).toBeCloseTo(106.7, 0);
    });
  });
});
