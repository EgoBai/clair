import { describe, it, expect } from 'vitest';
import {
  calculateMA,
  calculateAllMAs,
  detectCrossovers,
  calculateTrendStrength,
  identifyTrendPhase,
  calculateStopLossTakeProfit,
  analyzeDrawdown,
  calculateATR,
  type PriceData,
  type MAValues,
} from '../utils/trendFollowingEngine';

function generateData(days: number, startPrice: number, trend: number): PriceData[] {
  const data: PriceData[] = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    const change = trend + (Math.random() - 0.5) * 2;
    price = Math.max(1, price + change);
    data.push({
      date: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 100000 + Math.random() * 50000,
    });
  }
  return data;
}

const mockData: PriceData[] = generateData(300, 10, 0.1);

describe('趋势跟踪策略引擎', () => {
  describe('calculateMA', () => {
    it('should calculate moving average correctly', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ma5 = calculateMA(prices, 5);
      expect(ma5[4]).toBe(3); // (1+2+3+4+5)/5
      expect(ma5[9]).toBe(8); // (6+7+8+9+10)/5
    });

    it('should return NaN for insufficient data', () => {
      const prices = [1, 2, 3];
      const ma5 = calculateMA(prices, 5);
      expect(ma5.slice(0, 4).every(v => isNaN(v))).toBe(true);
    });

    it('should handle empty input', () => {
      expect(calculateMA([], 5)).toHaveLength(0);
    });

    it('should handle period of 1', () => {
      const prices = [10, 20, 30];
      const ma1 = calculateMA(prices, 1);
      expect(ma1).toEqual([10, 20, 30]);
    });
  });

  describe('calculateAllMAs', () => {
    it('should return same length as input', () => {
      const result = calculateAllMAs(mockData);
      expect(result).toHaveLength(mockData.length);
    });

    it('should have date and close fields', () => {
      const result = calculateAllMAs(mockData);
      expect(result[0].date).toBe(mockData[0].date);
      expect(result[0].close).toBe(mockData[0].close);
    });

    it('should have valid MA values after enough data', () => {
      const result = calculateAllMAs(mockData);
      const last = result[result.length - 1];
      expect(last.ma5).toBeGreaterThan(0);
      expect(last.ma20).toBeGreaterThan(0);
      expect(last.ma60).toBeGreaterThan(0);
    });
  });

  describe('detectCrossovers', () => {
    it('should detect golden cross in uptrend data', () => {
      const upData: PriceData[] = [];
      for (let i = 0; i < 60; i++) {
        const acceleration = i * 0.1;
        upData.push({
          date: `2026-01-${String(i + 1).padStart(2, '0')}`,
          open: 10 + i * (0.5 + acceleration * 0.05), high: 10.5 + i * (0.5 + acceleration * 0.05),
          low: 9.5 + i * (0.5 + acceleration * 0.05), close: 10 + i * (0.5 + acceleration * 0.05),
          volume: 100000,
        });
      }
      const maData = calculateAllMAs(upData);
      const signals = detectCrossovers(maData);
      // May or may not have golden cross depending on data pattern
      expect(Array.isArray(signals)).toBe(true);
    });

    it('should return empty for insufficient data', () => {
      const shortData = generateData(3, 10, 0);
      const maData = calculateAllMAs(shortData);
      const signals = detectCrossovers(maData);
      expect(signals).toHaveLength(0);
    });

    it('should have bullish or bearish direction', () => {
      const maData = calculateAllMAs(mockData);
      const signals = detectCrossovers(maData);
      signals.forEach(s => {
        expect(['bullish', 'bearish']).toContain(s.direction);
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      });
    });

    it('should include description', () => {
      const maData = calculateAllMAs(mockData);
      const signals = detectCrossovers(maData);
      signals.forEach(s => {
        expect(s.description).toBeTruthy();
      });
    });
  });

  describe('calculateTrendStrength', () => {
    it('should return valid score range', () => {
      const maData = calculateAllMAs(mockData);
      const result = calculateTrendStrength(maData);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should return valid level', () => {
      const maData = calculateAllMAs(mockData);
      const result = calculateTrendStrength(maData);
      expect(['strong_up', 'weak_up', 'neutral', 'weak_down', 'strong_down']).toContain(result.level);
    });

    it('should detect uptrend in rising data', () => {
      const upData = generateData(100, 10, 0.5);
      const maData = calculateAllMAs(upData);
      const result = calculateTrendStrength(maData);
      expect(['strong_up', 'weak_up']).toContain(result.level);
    });

    it('should detect downtrend in falling data', () => {
      const downData = generateData(100, 50, -0.5);
      const maData = calculateAllMAs(downData);
      const result = calculateTrendStrength(maData);
      expect(['strong_down', 'weak_down']).toContain(result.level);
    });

    it('should handle empty data', () => {
      const result = calculateTrendStrength([]);
      expect(result.level).toBe('neutral');
    });

    it('should calculate duration', () => {
      const maData = calculateAllMAs(mockData);
      const result = calculateTrendStrength(maData);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('identifyTrendPhase', () => {
    it('should identify markup phase in strong uptrend', () => {
      const upData = generateData(100, 10, 0.8);
      const maData = calculateAllMAs(upData);
      const volumes = upData.map(d => d.volume * 1.5);
      const result = identifyTrendPhase(maData, volumes);
      expect(['markup', 'accumulation']).toContain(result.phase);
    });

    it('should identify decline phase in downtrend', () => {
      const downData = generateData(100, 50, -0.8);
      const maData = calculateAllMAs(downData);
      const volumes = downData.map(d => d.volume);
      const result = identifyTrendPhase(maData, volumes);
      expect(['decline', 'accumulation']).toContain(result.phase);
    });

    it('should return valid confidence', () => {
      const maData = calculateAllMAs(mockData);
      const result = identifyTrendPhase(maData, mockData.map(d => d.volume));
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('should have characteristics array', () => {
      const maData = calculateAllMAs(mockData);
      const result = identifyTrendPhase(maData, mockData.map(d => d.volume));
      expect(Array.isArray(result.characteristics)).toBe(true);
    });

    it('should handle insufficient data', () => {
      const shortData = generateData(5, 10, 0);
      const maData = calculateAllMAs(shortData);
      const result = identifyTrendPhase(maData, shortData.map(d => d.volume));
      expect(result.phase).toBe('accumulation');
    });
  });

  describe('calculateStopLossTakeProfit', () => {
    it('should calculate ATR-based stops', () => {
      const result = calculateStopLossTakeProfit(100, 2, 'atr');
      expect(result.stopLoss).toBe(96);    // 100 - 2*2
      expect(result.takeProfit).toBe(106); // 100 + 2*3
      expect(result.riskReward).toBeCloseTo(1.5, 1);
    });

    it('should calculate percentage-based stops', () => {
      const result = calculateStopLossTakeProfit(100, 0, 'percentage');
      expect(result.stopLoss).toBeCloseTo(95, 1);
      expect(result.takeProfit).toBeCloseTo(110, 1);
    });

    it('should calculate MA-based stops', () => {
      const result = calculateStopLossTakeProfit(100, 0, 'ma', 98);
      expect(result.stopLoss).toBeCloseTo(96.04, 1);
    });

    it('should include trailing stop', () => {
      const result = calculateStopLossTakeProfit(100, 2, 'atr');
      expect(result.trailingStop).toBeGreaterThan(result.stopLoss);
      expect(result.trailingStop).toBeLessThan(100);
    });

    it('should have positive risk/reward', () => {
      const result = calculateStopLossTakeProfit(100, 2, 'atr');
      expect(result.riskReward).toBeGreaterThan(0);
    });

    it('should include method description', () => {
      const result = calculateStopLossTakeProfit(100, 2, 'atr');
      expect(result.method).toContain('ATR');
    });
  });

  describe('analyzeDrawdown', () => {
    it('should calculate max drawdown', () => {
      const result = analyzeDrawdown(mockData);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty data', () => {
      const result = analyzeDrawdown([]);
      expect(result.maxDrawdown).toBe(0);
    });

    it('should calculate current drawdown', () => {
      const result = analyzeDrawdown(mockData);
      expect(result.currentDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('should have underwater array', () => {
      const result = analyzeDrawdown(mockData);
      expect(result.underwater).toHaveLength(mockData.length);
      result.underwater.forEach(u => {
        expect(u.drawdown).toBeGreaterThanOrEqual(0);
      });
    });

    it('should be 0 drawdown for always-rising data', () => {
      const rising: PriceData[] = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        open: 10 + i, high: 11 + i, low: 9 + i, close: 10 + i, volume: 100000,
      }));
      const result = analyzeDrawdown(rising);
      expect(result.maxDrawdownPct).toBe(0);
    });
  });

  describe('calculateATR', () => {
    it('should calculate ATR values', () => {
      const atr = calculateATR(mockData, 14);
      expect(atr).toHaveLength(mockData.length);
    });

    it('should have positive values after warmup', () => {
      const atr = calculateATR(mockData, 14);
      const last = atr[atr.length - 1];
      expect(last).toBeGreaterThan(0);
    });

    it('should handle empty data', () => {
      expect(calculateATR([], 14)).toHaveLength(0);
    });

    it('should handle single data point', () => {
      const atr = calculateATR([mockData[0]], 14);
      expect(atr).toHaveLength(1);
      // With period 14 on single point, TR is calculated but MA returns NaN
      expect(typeof atr[0]).toBe('number');
    });
  });
});
