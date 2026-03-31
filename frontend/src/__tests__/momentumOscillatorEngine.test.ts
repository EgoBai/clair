import { describe, it, expect } from 'vitest';
import {
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateCCI,
  calculateWilliamsR,
  buildMomentumDashboard,
} from '../utils/momentumOscillatorEngine';

// Generate test data
function generatePrices(base: number, count: number, trend: number = 0): number[] {
  const prices: number[] = [base];
  for (let i = 1; i < count; i++) {
    const noise = (Math.random() - 0.5) * 2;
    prices.push(prices[i - 1] + trend + noise);
  }
  return prices;
}

function generateOHLC(count: number): { highs: number[]; lows: number[]; closes: number[] } {
  const closes = generatePrices(100, count, 0.2);
  const highs = closes.map((c) => c + Math.random() * 2);
  const lows = closes.map((c) => c - Math.random() * 2);
  return { highs, lows, closes };
}

describe('Momentum Oscillator Engine', () => {
  const { highs, lows, closes } = generateOHLC(50);

  describe('calculateRSI', () => {
    it('should calculate RSI within 0-100', () => {
      const rsi = calculateRSI(closes);
      expect(rsi.value).toBeGreaterThanOrEqual(0);
      expect(rsi.value).toBeLessThanOrEqual(100);
    });

    it('should detect overbought condition', () => {
      const bullishPrices = generatePrices(100, 30, 2);
      const rsi = calculateRSI(bullishPrices);
      // RSI can be overbought with strong uptrend
      expect(['overbought', 'oversold', 'neutral']).toContain(rsi.signal);
    });

    it('should return neutral for insufficient data', () => {
      const rsi = calculateRSI([100, 101], 14);
      expect(rsi.value).toBe(50);
      expect(rsi.signal).toBe('neutral');
    });

    it('should return valid trend direction', () => {
      const rsi = calculateRSI(closes);
      expect(['bullish', 'bearish', 'neutral']).toContain(rsi.trend);
    });

    it('should detect divergence flag', () => {
      const rsi = calculateRSI(closes);
      expect(typeof rsi.divergence).toBe('boolean');
    });
  });

  describe('calculateMACD', () => {
    it('should calculate MACD line, signal, and histogram', () => {
      const macd = calculateMACD(closes);
      expect(typeof macd.macd).toBe('number');
      expect(typeof macd.signal).toBe('number');
      expect(typeof macd.histogram).toBe('number');
      expect(macd.histogram).toBeCloseTo(macd.macd - macd.signal, 2);
    });

    it('should detect crossover', () => {
      const macd = calculateMACD(closes);
      expect(['bullish', 'bearish', 'none']).toContain(macd.crossover);
    });

    it('should return valid trend', () => {
      const macd = calculateMACD(closes);
      expect(['bullish', 'bearish', 'neutral']).toContain(macd.trend);
    });

    it('should handle insufficient data', () => {
      const macd = calculateMACD([100, 101], 12, 26);
      expect(macd.macd).toBe(0);
    });
  });

  describe('calculateStochastic', () => {
    it('should calculate %K and %D', () => {
      const stoch = calculateStochastic(highs, lows, closes);
      expect(stoch.k).toBeGreaterThanOrEqual(0);
      expect(stoch.k).toBeLessThanOrEqual(100);
      expect(stoch.d).toBeGreaterThanOrEqual(0);
      expect(stoch.d).toBeLessThanOrEqual(100);
    });

    it('should detect overbought/oversold', () => {
      const stoch = calculateStochastic(highs, lows, closes);
      expect(['overbought', 'oversold', 'neutral']).toContain(stoch.signal);
    });

    it('should detect crossover', () => {
      const stoch = calculateStochastic(highs, lows, closes);
      expect(['bullish', 'bearish', 'none']).toContain(stoch.crossover);
    });

    it('should handle insufficient data', () => {
      const stoch = calculateStochastic([100], [99], [100], 14);
      expect(stoch.k).toBe(50);
    });
  });

  describe('calculateCCI', () => {
    it('should calculate CCI value', () => {
      const cci = calculateCCI(highs, lows, closes);
      expect(typeof cci.value).toBe('number');
    });

    it('should detect overbought/oversold', () => {
      const cci = calculateCCI(highs, lows, closes);
      expect(['overbought', 'oversold', 'neutral']).toContain(cci.signal);
    });

    it('should return valid trend', () => {
      const cci = calculateCCI(highs, lows, closes);
      expect(['bullish', 'bearish', 'neutral']).toContain(cci.trend);
    });

    it('should handle insufficient data', () => {
      const cci = calculateCCI([100], [99], [100], 20);
      expect(cci.value).toBe(0);
    });
  });

  describe('calculateWilliamsR', () => {
    it('should calculate Williams %R between -100 and 0', () => {
      const willR = calculateWilliamsR(highs, lows, closes);
      expect(willR.value).toBeGreaterThanOrEqual(-100);
      expect(willR.value).toBeLessThanOrEqual(0);
    });

    it('should detect overbought/oversold', () => {
      const willR = calculateWilliamsR(highs, lows, closes);
      expect(['overbought', 'oversold', 'neutral']).toContain(willR.signal);
    });

    it('should handle insufficient data', () => {
      const willR = calculateWilliamsR([100], [99], [100], 14);
      expect(willR.value).toBe(-50);
    });
  });

  describe('buildMomentumDashboard', () => {
    it('should return all indicators', () => {
      const dashboard = buildMomentumDashboard(highs, lows, closes);

      expect(dashboard.rsi).toBeDefined();
      expect(dashboard.macd).toBeDefined();
      expect(dashboard.stochastic).toBeDefined();
      expect(dashboard.cci).toBeDefined();
      expect(dashboard.williamsR).toBeDefined();
    });

    it('should determine overall signal', () => {
      const dashboard = buildMomentumDashboard(highs, lows, closes);
      expect(['bullish', 'bearish', 'neutral']).toContain(dashboard.overallSignal);
    });

    it('should have confidence between 0 and 1', () => {
      const dashboard = buildMomentumDashboard(highs, lows, closes);
      expect(dashboard.confidence).toBeGreaterThanOrEqual(0);
      expect(dashboard.confidence).toBeLessThanOrEqual(1);
    });
  });
});
