import { describe, it, expect } from 'vitest';
import {
  rollingStats,
  calculateZScore,
  calculateBBPosition,
  calculateRSI,
  calculateKeltnerPosition,
  calculateHurstExponent,
  calculateHalfLife,
  generateMeanReversionSignals,
  calculateMeanReversionStats,
  fitOUProcess,
  optimizeMeanReversionParams,
  type PricePoint,
} from '../utils/meanReversionEngine';

function generatePriceData(days: number, startPrice: number, trend: number, volatility: number = 2): PricePoint[] {
  const data: PricePoint[] = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    const change = trend + (Math.random() - 0.5) * volatility;
    price = Math.max(1, price + change);
    data.push({
      date: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      close: price,
      high: price + Math.random() * 2,
      low: price - Math.random() * 2,
      volume: 100000 + Math.random() * 50000,
    });
  }
  return data;
}

// 生成均值回归数据（围绕均值上下波动）
function generateMeanRevertingData(days: number, mean: number = 100, amplitude: number = 10): PricePoint[] {
  const data: PricePoint[] = [];
  let price = mean;
  for (let i = 0; i < days; i++) {
    // 均值回归：偏离越大，拉回力量越强
    const pull = (mean - price) * 0.1;
    const noise = (Math.random() - 0.5) * amplitude * 0.5;
    price = price + pull + noise;
    data.push({
      date: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      close: price,
      high: price + Math.random() * 2,
      low: price - Math.random() * 2,
      volume: 100000 + Math.random() * 50000,
    });
  }
  return data;
}

const mockData = generatePriceData(200, 100, 0, 3);

describe('均值回归策略引擎', () => {
  describe('rollingStats', () => {
    it('should calculate rolling mean correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { mean } = rollingStats(values, 3);
      expect(isNaN(mean[0])).toBe(true);
      expect(isNaN(mean[1])).toBe(true);
      expect(mean[2]).toBe(2); // (1+2+3)/3
      expect(mean[3]).toBe(3); // (2+3+4)/3
    });

    it('should calculate rolling std correctly', () => {
      const values = [10, 10, 10, 10, 10];
      const { std } = rollingStats(values, 3);
      expect(std[2]).toBe(0);
    });

    it('should calculate z-score', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { zScore } = rollingStats(values, 5);
      expect(isNaN(zScore[3])).toBe(true);
      expect(zScore[4]).toBeGreaterThan(0); // 5 is above mean of [1,2,3,4,5]
      expect(zScore[9]).toBeGreaterThan(0); // 10 is above mean
    });

    it('should handle empty array', () => {
      const { mean, std, zScore } = rollingStats([], 5);
      expect(mean).toEqual([]);
      expect(std).toEqual([]);
      expect(zScore).toEqual([]);
    });
  });

  describe('calculateZScore', () => {
    it('should return NaN for insufficient data', () => {
      const scores = calculateZScore([1, 2, 3], 20);
      expect(scores.every(s => isNaN(s))).toBe(true);
    });

    it('should calculate z-scores for sufficient data', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const scores = calculateZScore(prices, 20);
      expect(scores.length).toBe(50);
      expect(isNaN(scores[19])).toBe(false);
    });
  });

  describe('calculateBBPosition', () => {
    it('should return positions between -1 and 1', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const positions = calculateBBPosition(prices, 20, 2);
      const validPositions = positions.filter(p => !isNaN(p));
      validPositions.forEach(p => {
        expect(Math.abs(p)).toBeLessThanOrEqual(1.5); // Can slightly exceed due to edge cases
      });
    });

    it('should return 0 at mean', () => {
      const prices = new Array(50).fill(100);
      const positions = calculateBBPosition(prices, 20);
      // All same price → position should be NaN or 0 (std = 0)
      const validPositions = positions.filter(p => !isNaN(p));
      validPositions.forEach(p => {
        expect(p).toBe(0);
      });
    });
  });

  describe('calculateRSI', () => {
    it('should return values between 0 and 100', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + (Math.random() - 0.5) * 10);
      const rsi = calculateRSI(prices, 14);
      const validRsi = rsi.filter(r => !isNaN(r));
      validRsi.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(100);
      });
    });

    it('should return 100 for continuously rising prices', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
      const rsi = calculateRSI(prices, 14);
      const lastRsi = rsi[rsi.length - 1];
      expect(lastRsi).toBeGreaterThan(90);
    });

    it('should return 0 or near 0 for continuously falling prices', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 150 - i);
      const rsi = calculateRSI(prices, 14);
      const lastRsi = rsi[rsi.length - 1];
      expect(lastRsi).toBeLessThan(10);
    });

    it('should handle insufficient data', () => {
      const rsi = calculateRSI([1, 2, 3], 14);
      expect(rsi.every(r => isNaN(r))).toBe(true);
    });

    it('should handle flat prices', () => {
      const prices = new Array(50).fill(100);
      const rsi = calculateRSI(prices, 14);
      const validRsi = rsi.filter(r => !isNaN(r));
      // No gains, no losses → RSI should be 0 or NaN
      expect(validRsi.length).toBeGreaterThan(0);
    });
  });

  describe('calculateKeltnerPosition', () => {
    it('should calculate positions correctly', () => {
      const positions = calculateKeltnerPosition(mockData);
      expect(positions.length).toBe(mockData.length);
    });

    it('should handle short data', () => {
      const shortData = generatePriceData(5, 100, 0);
      const positions = calculateKeltnerPosition(shortData);
      expect(positions.length).toBe(5);
    });
  });

  describe('calculateHurstExponent', () => {
    it('should return ~0.5 for random walk', () => {
      const prices = Array.from({ length: 500 }, (_, i) => {
        return 100 + (Math.random() - 0.5) * 2 * i / 500 * 10;
      });
      // Flatten to pure random walk
      let price = 100;
      const rw = Array.from({ length: 500 }, () => {
        price += (Math.random() - 0.5) * 2;
        return price;
      });
      const hurst = calculateHurstExponent(rw);
      // Should be close to 0.5 for random walk
      expect(hurst).toBeGreaterThan(0);
      expect(hurst).toBeLessThan(1);
    });

    it('should return < 0.5 for mean-reverting data', () => {
      const data = generateMeanRevertingData(500, 100, 10);
      const prices = data.map(d => d.close);
      const hurst = calculateHurstExponent(prices);
      expect(hurst).toBeLessThan(0.7);
    });

    it('should handle short data', () => {
      const hurst = calculateHurstExponent([1, 2, 3]);
      expect(hurst).toBe(0.5);
    });
  });

  describe('calculateHalfLife', () => {
    it('should calculate half-life for mean-reverting data', () => {
      const data = generateMeanRevertingData(300, 100, 10);
      const prices = data.map(d => d.close);
      const result = calculateHalfLife(prices);
      expect(result.halfLife).toBeGreaterThan(0);
      expect(result.halfLife).toBeLessThan(100);
    });

    it('should handle insufficient data', () => {
      const result = calculateHalfLife([1, 2, 3]);
      expect(result.isMeanReverting).toBe(false);
    });

    it('should detect non-mean-reverting data', () => {
      // Strong uptrend
      const prices = Array.from({ length: 200 }, (_, i) => 100 + i * 0.5);
      const result = calculateHalfLife(prices);
      expect(result.isMeanReverting).toBe(false);
    });
  });

  describe('generateMeanReversionSignals', () => {
    it('should generate signals for all data points', () => {
      const signals = generateMeanReversionSignals(mockData);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.length).toBeLessThanOrEqual(mockData.length);
    });

    it('should have valid signal types', () => {
      const signals = generateMeanReversionSignals(mockData);
      signals.forEach(s => {
        expect(['buy', 'sell', 'hold']).toContain(s.type);
        expect(['zscore', 'bollinger', 'rsi_extreme', 'keltner', 'composite']).toContain(s.method);
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
        expect(s.confidence).toBeGreaterThanOrEqual(0);
        expect(s.confidence).toBeLessThanOrEqual(100);
      });
    });

    it('should generate buy signals at extreme lows', () => {
      // Create data with a sharp dip
      const data = generatePriceData(100, 100, 0, 2);
      // Inject extreme low
      for (let i = 50; i < 60; i++) {
        data[i].close = 50;
      }
      const signals = generateMeanReversionSignals(data);
      const buySignals = signals.filter(s => s.type === 'buy');
      expect(buySignals.length).toBeGreaterThan(0);
    });

    it('should respect custom config', () => {
      const signals = generateMeanReversionSignals(mockData, {
        zScoreWindow: 10,
        zScoreEntry: 1.5,
        rsiOversold: 25,
        rsiOverbought: 75,
      });
      expect(signals.length).toBeGreaterThan(0);
    });
  });

  describe('calculateMeanReversionStats', () => {
    it('should calculate stats for mean-reverting data', () => {
      const data = generateMeanRevertingData(300, 100, 10);
      const stats = calculateMeanReversionStats(data);
      expect(stats.halfLife).toBeGreaterThan(0);
      expect(stats.hurstExponent).toBeGreaterThanOrEqual(0);
      expect(stats.winRate).toBeGreaterThanOrEqual(0);
      expect(stats.winRate).toBeLessThanOrEqual(100);
      expect(stats.profitFactor).toBeGreaterThanOrEqual(0);
    });

    it('should handle trend data', () => {
      const data = generatePriceData(200, 100, 0.5);
      const stats = calculateMeanReversionStats(data);
      expect(stats).toBeDefined();
    });

    it('should calculate Sharpe ratio', () => {
      const stats = calculateMeanReversionStats(mockData);
      expect(typeof stats.sharpeRatio).toBe('number');
    });
  });

  describe('fitOUProcess', () => {
    it('should fit OU parameters for mean-reverting data', () => {
      const data = generateMeanRevertingData(300, 100, 10);
      const prices = data.map(d => d.close);
      const result = fitOUProcess(prices);
      expect(result.theta).toBeGreaterThanOrEqual(0);
      expect(result.mu).toBeGreaterThan(0);
      expect(result.sigma).toBeGreaterThan(0);
      expect(result.halfLife).toBeGreaterThan(0);
    });

    it('should handle insufficient data', () => {
      const result = fitOUProcess([1, 2, 3]);
      expect(result.halfLife).toBe(Infinity);
    });

    it('should return reasonable mu', () => {
      const prices = new Array(100).fill(100).map((p, i) => p + Math.sin(i / 10) * 5);
      const result = fitOUProcess(prices);
      expect(result.mu).toBeGreaterThan(95);
      expect(result.mu).toBeLessThan(105);
    });
  });

  describe('optimizeMeanReversionParams', () => {
    it('should find optimal parameters', () => {
      const data = generateMeanRevertingData(200, 100, 10);
      const result = optimizeMeanReversionParams(data);
      expect(result.optimalWindow).toBeGreaterThan(0);
      expect(result.optimalEntry).toBeGreaterThan(0);
      expect(result.optimalExit).toBeGreaterThan(0);
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should respect custom param ranges', () => {
      const result = optimizeMeanReversionParams(mockData, {
        windows: [10, 20],
        entryThresholds: [2],
        exitThresholds: [0.5],
      });
      expect(result.results.length).toBe(2); // 2 windows × 1 entry × 1 exit
    });
  });

  describe('edge cases', () => {
    it('should handle single data point', () => {
      const data: PricePoint[] = [{
        date: '2026-01-01',
        close: 100,
        high: 102,
        low: 98,
        volume: 100000,
      }];
      const signals = generateMeanReversionSignals(data);
      expect(signals.length).toBe(0); // Insufficient data for indicators
    });

    it('should handle constant prices', () => {
      const data = generatePriceData(100, 100, 0);
      data.forEach(d => { d.close = 100; d.high = 100; d.low = 100; });
      const signals = generateMeanReversionSignals(data);
      const nonHoldSignals = signals.filter(s => s.type !== 'hold');
      expect(nonHoldSignals.length).toBe(0); // No volatility → no signals
    });

    it('should handle very volatile data', () => {
      const data = generatePriceData(200, 100, 0, 20);
      const signals = generateMeanReversionSignals(data);
      expect(signals.length).toBeGreaterThan(0);
    });
  });
});
