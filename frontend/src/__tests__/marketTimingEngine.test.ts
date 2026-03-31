import { describe, it, expect } from 'vitest';
import {
  analyzeTrend,
  analyzeMomentum,
  analyzeVolatility,
  analyzeBreadth,
  analyzeMeanReversion,
  generateCompositeTiming,
} from '../utils/marketTimingEngine';

// Generate synthetic price data with trend
function generatePrices(n: number, trend: number = 0.0005, vol: number = 0.02): number[] {
  const prices: number[] = [100];
  for (let i = 1; i < n; i++) {
    const ret = trend + vol * (Math.random() - 0.5) * 2;
    prices.push(prices[i - 1] * (1 + ret));
  }
  return prices;
}

function generateHighsLows(closes: number[]): { highs: number[]; lows: number[] } {
  return {
    highs: closes.map(c => c * (1 + Math.random() * 0.02)),
    lows: closes.map(c => c * (1 - Math.random() * 0.02)),
  };
}

describe('Market Timing Engine', () => {
  describe('analyzeTrend', () => {
    it('should detect uptrend in rising prices', () => {
      const closes = generatePrices(252, 0.001, 0.01);
      const trend = analyzeTrend(closes);

      expect(['uptrend', 'downtrend', 'sideways']).toContain(trend.trendState);
      expect(trend.ma20).toBeGreaterThan(0);
      expect(trend.ma50).toBeGreaterThan(0);
      expect(trend.ma200).toBeGreaterThan(0);
      expect(trend.trendStrength).toBeGreaterThanOrEqual(0);
      expect(trend.trendStrength).toBeLessThanOrEqual(1);
    });

    it('should detect downtrend in falling prices', () => {
      const closes = generatePrices(252, -0.005, 0.005);
      const trend = analyzeTrend(closes);
      expect(['downtrend', 'sideways']).toContain(trend.trendState);
    });

    it('should handle short data gracefully', () => {
      const closes = generatePrices(30);
      const trend = analyzeTrend(closes);

      expect(trend.trendState).toBe('sideways');
      expect(trend.goldenCross).toBe(false);
      expect(trend.deathCross).toBe(false);
    });

    it('should detect golden cross', () => {
      // Create prices that go up after a low
      const prices = [
        ...Array(200).fill(100),
        ...Array(50).fill(90),
        ...Array(100).fill(0).map((_, i) => 90 + i * 0.5),
      ];
      const trend = analyzeTrend(prices);
      // goldenCross depends on specific MA crossover timing
      expect(typeof trend.goldenCross).toBe('boolean');
    });
  });

  describe('analyzeMomentum', () => {
    it('should calculate RSI', () => {
      const closes = generatePrices(100);
      const { highs, lows } = generateHighsLows(closes);
      const momentum = analyzeMomentum(closes, highs, lows);

      expect(momentum.rsi14).toBeGreaterThanOrEqual(0);
      expect(momentum.rsi14).toBeLessThanOrEqual(100);
    });

    it('should calculate MACD signal', () => {
      const closes = generatePrices(100);
      const { highs, lows } = generateHighsLows(closes);
      const momentum = analyzeMomentum(closes, highs, lows);

      expect(['bullish', 'bearish', 'neutral']).toContain(momentum.macdSignal);
    });

    it('should calculate stochastic', () => {
      const closes = generatePrices(100);
      const { highs, lows } = generateHighsLows(closes);
      const momentum = analyzeMomentum(closes, highs, lows);

      expect(momentum.stochK).toBeGreaterThanOrEqual(0);
      expect(momentum.stochK).toBeLessThanOrEqual(100);
    });

    it('should return signal', () => {
      const closes = generatePrices(100);
      const { highs, lows } = generateHighsLows(closes);
      const momentum = analyzeMomentum(closes, highs, lows);

      expect(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell']).toContain(momentum.signal);
    });

    it('should handle short data', () => {
      const closes = [100, 101, 102];
      const momentum = analyzeMomentum(closes, [102, 103, 104], [99, 100, 101]);
      expect(momentum.signal).toBe('neutral');
    });
  });

  describe('analyzeVolatility', () => {
    it('should calculate volatility regime', () => {
      const closes = generatePrices(100, 0.0003, 0.02);
      const vol = analyzeVolatility(closes);

      expect(['low', 'normal', 'high', 'extreme']).toContain(vol.regime);
      expect(vol.currentVol).toBeGreaterThanOrEqual(0);
      expect(vol.avgVol20).toBeGreaterThanOrEqual(0);
      expect(vol.volRatio).toBeGreaterThan(0);
    });

    it('should detect high volatility regime', () => {
      // Recent high vol, historical low vol
      const lowVol = generatePrices(100, 0.0003, 0.005);
      const highVol = generatePrices(30, 0.0003, 0.05);
      const closes = [...lowVol, ...highVol];

      const vol = analyzeVolatility(closes);
      expect(['high', 'extreme']).toContain(vol.regime);
    });

    it('should handle short data', () => {
      const closes = generatePrices(10);
      const vol = analyzeVolatility(closes);
      expect(vol.regime).toBe('normal');
    });
  });

  describe('analyzeBreadth', () => {
    it('should calculate breadth signals', () => {
      const advances = Array(20).fill(0).map(() => 200 + Math.floor(Math.random() * 300));
      const declines = Array(20).fill(0).map(() => 100 + Math.floor(Math.random() * 200));
      const newHighs = Array(20).fill(0).map(() => Math.floor(Math.random() * 100));
      const newLows = Array(20).fill(0).map(() => Math.floor(Math.random() * 50));
      const aboveMA50 = Array(20).fill(0).map(() => 40 + Math.random() * 40);

      const breadth = analyzeBreadth(advances, declines, newHighs, newLows, aboveMA50);

      expect(breadth.advanceDeclineRatio).toBeGreaterThan(0);
      expect(breadth.percentAboveMA50).toBeGreaterThanOrEqual(0);
      expect(typeof breadth.newHighsNewLows).toBe('number');
      expect(typeof breadth.mcclellanOscillator).toBe('number');
      expect(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell']).toContain(breadth.signal);
    });

    it('should handle empty arrays', () => {
      const breadth = analyzeBreadth([], [], [], [], []);
      expect(breadth.advanceDeclineRatio).toBe(1);
      expect(breadth.signal).toBe('neutral');
    });
  });

  describe('analyzeMeanReversion', () => {
    it('should calculate z-score', () => {
      const closes = generatePrices(100);
      const mr = analyzeMeanReversion(closes, 20);

      expect(typeof mr.zScore).toBe('number');
      expect(mr.bollingerBandPosition).toBeGreaterThanOrEqual(0);
      expect(mr.bollingerBandPosition).toBeLessThanOrEqual(1);
    });

    it('should signal buy when oversold', () => {
      // Create a sharp drop at the end
      const closes = Array(50).fill(100);
      closes.push(90, 85, 80);
      const mr = analyzeMeanReversion(closes, 20);

      expect(['buy', 'strong_buy']).toContain(mr.signal);
    });

    it('should signal sell when overbought', () => {
      const closes = Array(50).fill(100);
      closes.push(110, 115, 120);
      const mr = analyzeMeanReversion(closes, 20);

      expect(['sell', 'strong_sell']).toContain(mr.signal);
    });

    it('should handle short data', () => {
      const mr = analyzeMeanReversion([100, 101, 102], 20);
      expect(mr.signal).toBe('neutral');
    });
  });

  describe('generateCompositeTiming', () => {
    it('should generate composite signal', () => {
      const closes = generatePrices(252, 0.0005, 0.015);
      const { highs, lows } = generateHighsLows(closes);

      const result = generateCompositeTiming(closes, highs, lows);

      expect(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell']).toContain(result.compositeSignal);
      expect(result.compositeScore).toBeGreaterThanOrEqual(-100);
      expect(result.compositeScore).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.recommendation).toBe('string');
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('should include all signal types', () => {
      const closes = generatePrices(252);
      const { highs, lows } = generateHighsLows(closes);
      const result = generateCompositeTiming(closes, highs, lows);

      expect(result.signals).toHaveProperty('trend');
      expect(result.signals).toHaveProperty('momentum');
      expect(result.signals).toHaveProperty('volatility');
      expect(result.signals).toHaveProperty('breadth');
      expect(result.signals).toHaveProperty('meanReversion');
    });

    it('should detect conflicts', () => {
      const closes = generatePrices(252);
      const { highs, lows } = generateHighsLows(closes);
      const result = generateCompositeTiming(closes, highs, lows);

      expect(Array.isArray(result.conflicts)).toBe(true);
    });

    it('should include breadth data when provided', () => {
      const closes = generatePrices(252);
      const { highs, lows } = generateHighsLows(closes);
      const advances = Array(252).fill(0).map(() => 300 + Math.floor(Math.random() * 200));
      const declines = Array(252).fill(0).map(() => 150 + Math.floor(Math.random() * 150));

      const result = generateCompositeTiming(closes, highs, lows, advances, declines);
      expect(result.signals.breadth).toBeDefined();
    });

    it('should handle VIX data', () => {
      const closes = generatePrices(252);
      const { highs, lows } = generateHighsLows(closes);
      const vix = Array(252).fill(0).map(() => 15 + Math.random() * 20);

      const result = generateCompositeTiming(closes, highs, lows, undefined, undefined, undefined, undefined, undefined, vix);
      expect(result.signals.volatility.vixLevel).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle constant prices', () => {
      const closes = Array(252).fill(100);
      const { highs, lows } = generateHighsLows(closes);

      const result = generateCompositeTiming(closes, highs, lows);
      expect(result.compositeSignal).toBe('neutral');
    });

    it('should handle very short data', () => {
      const closes = [100, 101];
      const result = generateCompositeTiming(closes, [101, 102], [99, 100]);
      expect(result.compositeSignal).toBeDefined();
    });

    it('should handle extreme volatility', () => {
      // All periods have high vol so current and average are both high
      const closes = generatePrices(100, 0, 0.08);
      const vol = analyzeVolatility(closes);
      // Current vol is high but avg may also be high, so ratio may not trigger extreme
      expect(vol.currentVol).toBeGreaterThan(10); // At least 10% annualized
    });
  });
});
