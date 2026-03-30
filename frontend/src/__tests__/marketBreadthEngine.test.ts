import { describe, it, expect } from 'vitest';
import {
  calculateBreadth,
  breadthIndicators,
  generateBreadthSignals,
  sectorBreadth,
  type StockSnapshot,
  type BreadthData,
} from '../utils/marketBreadthEngine';

describe('MarketBreadthEngine', () => {
  function makeStock(overrides: Partial<StockSnapshot> = {}): StockSnapshot {
    return {
      ticker: '000001',
      price: 10,
      change: 0.5,
      changePercent: 5,
      volume: 1e6,
      ma5: 9.8,
      ma20: 9.5,
      ma60: 9.0,
      high52w: 12,
      low52w: 7,
      ...overrides,
    };
  }

  const mockStocks: StockSnapshot[] = [
    makeStock({ ticker: 'A', price: 11, changePercent: 3, ma20: 10, ma60: 9, high52w: 11 }),
    makeStock({ ticker: 'B', price: 9, changePercent: -2, ma20: 10, ma60: 9.5, low52w: 9 }),
    makeStock({ ticker: 'C', price: 10, changePercent: 0, ma20: 9.5, ma60: 9 }),
    makeStock({ ticker: 'D', price: 12, changePercent: 5, ma20: 11, ma60: 10, high52w: 12 }),
    makeStock({ ticker: 'E', price: 8, changePercent: -4, ma20: 9, ma60: 8.5, low52w: 8 }),
    makeStock({ ticker: 'F', price: 11.5, changePercent: 2, ma20: 11, ma60: 10 }),
    makeStock({ ticker: 'G', price: 7, changePercent: -1, ma20: 8, ma60: 7.5 }),
    makeStock({ ticker: 'H', price: 13, changePercent: 8, ma20: 12, ma60: 11, high52w: 13 }),
  ];

  describe('calculateBreadth', () => {
    it('should count advances and declines', () => {
      const result = calculateBreadth(mockStocks);
      expect(result.advanceCount).toBe(4); // A, D, F, H (changePercent > 0.01)
      expect(result.declineCount).toBe(3); // B, E, G
      expect(result.unchangedCount).toBe(1); // C
    });

    it('should count new highs', () => {
      const result = calculateBreadth(mockStocks);
      // A, D, H are within 1% of 52w high
      expect(result.newHighCount).toBe(3);
    });

    it('should count new lows', () => {
      const result = calculateBreadth(mockStocks);
      // B, E, G are within 1% of 52w low
      expect(result.newLowCount).toBe(3);
    });

    it('should count above/below MA20', () => {
      const result = calculateBreadth(mockStocks);
      expect(result.aboveMA20 + result.belowMA20).toBe(8);
    });

    it('should count above/below MA60', () => {
      const result = calculateBreadth(mockStocks);
      expect(result.aboveMA60 + result.belowMA60).toBe(8);
    });

    it('should calculate AD line', () => {
      const result = calculateBreadth(mockStocks);
      expect(result.adLine).toBe(1); // 4 - 3
    });

    it('should handle empty stocks', () => {
      const result = calculateBreadth([]);
      expect(result.advanceCount).toBe(0);
      expect(result.adLine).toBe(0);
    });
  });

  describe('breadthIndicators', () => {
    it('should calculate AD ratio', () => {
      const data = calculateBreadth(mockStocks);
      const result = breadthIndicators(data, mockStocks.length);
      expect(result.adRatio).toBeCloseTo(4 / 3, 1);
    });

    it('should calculate MA breadth', () => {
      const data = calculateBreadth(mockStocks);
      const result = breadthIndicators(data, mockStocks.length);
      expect(result.ma20Breadth).toBeGreaterThan(0);
      expect(result.ma20Breadth).toBeLessThanOrEqual(1);
    });

    it('should calculate overall breadth', () => {
      const data = calculateBreadth(mockStocks);
      const result = breadthIndicators(data, mockStocks.length);
      expect(result.overallBreadth).toBeGreaterThanOrEqual(0);
      expect(result.overallBreadth).toBeLessThanOrEqual(100);
    });

    it('should calculate new high/low ratio', () => {
      const data = calculateBreadth(mockStocks);
      const result = breadthIndicators(data, mockStocks.length);
      // newHighCount=3, newLowCount=3, ratio=1
      expect(result.newHighLowRatio).toBe(1);
    });

    it('should handle zero stocks', () => {
      const empty: BreadthData = {
        advanceCount: 0, declineCount: 0, unchangedCount: 0,
        newHighCount: 0, newLowCount: 0,
        aboveMA20: 0, belowMA20: 0, aboveMA60: 0, belowMA60: 0,
        adLine: 0, mcclellanOscillator: 0,
      };
      const result = breadthIndicators(empty, 0);
      expect(result.ma20Breadth).toBe(0.5);
    });
  });

  describe('generateBreadthSignals', () => {
    it('should generate bullish for strong advance ratio', () => {
      const current: BreadthData = {
        advanceCount: 800, declineCount: 100, unchangedCount: 100,
        newHighCount: 50, newLowCount: 10,
        aboveMA20: 700, belowMA20: 300, aboveMA60: 600, belowMA60: 400,
        adLine: 700, mcclellanOscillator: 700,
      };
      const previous: BreadthData = {
        ...current, advanceCount: 400, declineCount: 400, adLine: 0,
      };
      const signals = generateBreadthSignals(current, previous, 1000);
      expect(signals.some((s) => s.type === 'bullish')).toBe(true);
    });

    it('should generate bearish for weak breadth', () => {
      const current: BreadthData = {
        advanceCount: 100, declineCount: 800, unchangedCount: 100,
        newHighCount: 5, newLowCount: 100,
        aboveMA20: 200, belowMA20: 800, aboveMA60: 150, belowMA60: 850,
        adLine: -700, mcclellanOscillator: -700,
      };
      const previous: BreadthData = {
        ...current, advanceCount: 400, declineCount: 400, adLine: 0,
      };
      const signals = generateBreadthSignals(current, previous, 1000);
      expect(signals.some((s) => s.type === 'bearish')).toBe(true);
    });

    it('should detect divergence', () => {
      const current: BreadthData = {
        advanceCount: 600, declineCount: 300, unchangedCount: 100,
        newHighCount: 10, newLowCount: 5,
        aboveMA20: 500, belowMA20: 500, aboveMA60: 400, belowMA60: 600,
        adLine: 300, mcclellanOscillator: 300,
      };
      const previous: BreadthData = {
        ...current, newHighCount: 30,
      };
      const signals = generateBreadthSignals(current, previous, 1000);
      // Index up but fewer new highs = divergence
      expect(signals.some((s) => s.type === 'divergence')).toBe(true);
    });

    it('should return neutral for balanced market', () => {
      const balanced: BreadthData = {
        advanceCount: 500, declineCount: 490, unchangedCount: 10,
        newHighCount: 20, newLowCount: 18,
        aboveMA20: 500, belowMA20: 500, aboveMA60: 480, belowMA60: 520,
        adLine: 10, mcclellanOscillator: 10,
      };
      const signals = generateBreadthSignals(balanced, balanced, 1000);
      expect(signals.length).toBeGreaterThanOrEqual(1);
    });

    it('should assign strength 0-100', () => {
      const current = calculateBreadth(mockStocks);
      const previous = calculateBreadth(mockStocks);
      const signals = generateBreadthSignals(current, previous, mockStocks.length);
      for (const s of signals) {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('sectorBreadth', () => {
    const sectorMap = new Map<string, StockSnapshot[]>([
      ['科技', [
        makeStock({ ticker: 'T1', changePercent: 3, ma20: 9 }),
        makeStock({ ticker: 'T2', changePercent: 5, ma20: 9 }),
        makeStock({ ticker: 'T3', changePercent: -1, ma20: 11 }),
      ]],
      ['银行', [
        makeStock({ ticker: 'B1', changePercent: -2, ma20: 11 }),
        makeStock({ ticker: 'B2', changePercent: -3, ma20: 11 }),
      ]],
    ]);

    it('should calculate breadth per sector', () => {
      const result = sectorBreadth(sectorMap);
      expect(result).toHaveLength(2);
      const tech = result.find((r) => r.sector === '科技');
      expect(tech!.breadth).toBe(67); // 2/3 advances
    });

    it('should sort by breadth descending', () => {
      const result = sectorBreadth(sectorMap);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].breadth).toBeGreaterThanOrEqual(result[i].breadth);
      }
    });

    it('should calculate advance ratio', () => {
      const result = sectorBreadth(sectorMap);
      for (const r of result) {
        expect(r.advanceRatio).toBeGreaterThanOrEqual(0);
        expect(r.advanceRatio).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate MA20 ratio', () => {
      const result = sectorBreadth(sectorMap);
      for (const r of result) {
        expect(r.aboveMA20Ratio).toBeGreaterThanOrEqual(0);
        expect(r.aboveMA20Ratio).toBeLessThanOrEqual(1);
      }
    });

    it('should handle empty map', () => {
      const result = sectorBreadth(new Map());
      expect(result).toHaveLength(0);
    });
  });
});
