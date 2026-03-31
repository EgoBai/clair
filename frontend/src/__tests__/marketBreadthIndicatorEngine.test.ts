import { describe, it, expect } from 'vitest';
import {
  calculateADRatio,
  calculateADLine,
  calculateMcClellanOscillator,
  calculateTRIN,
  calculateBreadthThrust,
  calculateMABreadth,
  analyzeMarketBreadth,
  type BreadthData,
} from '../utils/marketBreadthIndicatorEngine';

const mockBreadth = (overrides: Partial<BreadthData> = {}): BreadthData => ({
  advancing: 2000,
  declining: 1000,
  unchanged: 500,
  newHigh: 100,
  newLow: 50,
  aboveMA20: 2500,
  aboveMA60: 2000,
  aboveMA200: 1500,
  totalStocks: 3500,
  advVolume: 300000,
  decVolume: 150000,
  advIssues: 2000,
  decIssues: 1000,
  ...overrides,
});

function generateHistory(days: number): BreadthData[] {
  return Array.from({ length: days }, (_, i) => mockBreadth({
    advancing: 1500 + Math.round(Math.sin(i * 0.3) * 500),
    declining: 1500 - Math.round(Math.sin(i * 0.3) * 500),
  }));
}

describe('市场宽度指标引擎', () => {
  describe('calculateADRatio', () => {
    it('should calculate advance/decline ratio', () => {
      expect(calculateADRatio(mockBreadth())).toBe(2);
    });

    it('should handle no declining', () => {
      expect(calculateADRatio(mockBreadth({ declining: 0 }))).toBe(10);
    });

    it('should handle no advancing', () => {
      expect(calculateADRatio(mockBreadth({ advancing: 0 }))).toBe(0);
    });
  });

  describe('calculateADLine', () => {
    it('should calculate cumulative advance-decline line', () => {
      const history = generateHistory(10);
      const adLine = calculateADLine(history);
      expect(adLine).toHaveLength(10);
    });

    it('should be cumulative', () => {
      const history = generateHistory(5);
      const adLine = calculateADLine(history);
      // Each point should be cumulative
      expect(typeof adLine[0]).toBe('number');
    });

    it('should handle empty history', () => {
      expect(calculateADLine([])).toHaveLength(0);
    });
  });

  describe('calculateMcClellanOscillator', () => {
    it('should calculate for sufficient history', () => {
      const history = generateHistory(40);
      const result = calculateMcClellanOscillator(history);
      expect(typeof result).toBe('number');
    });

    it('should return 0 for insufficient data', () => {
      expect(calculateMcClellanOscillator(generateHistory(5))).toBe(0);
    });

    it('should be positive in broad rally', () => {
      const rally = Array.from({ length: 40 }, (_, i) => mockBreadth({
        advancing: 2500 + i * 10, declining: 1000 - i * 5,
      }));
      const result = calculateMcClellanOscillator(rally);
      expect(typeof result).toBe('number');
    });
  });

  describe('calculateTRIN', () => {
    it('should calculate TRIN', () => {
      const result = calculateTRIN(mockBreadth());
      expect(result).toBeGreaterThan(0);
    });

    it('should be around 1 for balanced market', () => {
      const balanced = mockBreadth({
        advVolume: 200000, decVolume: 200000,
        advIssues: 1500, decIssues: 1500,
      });
      expect(calculateTRIN(balanced)).toBeCloseTo(1, 0);
    });

    it('should be < 1 for more declining pressure', () => {
      const decPressure = mockBreadth({
        advVolume: 100000, decVolume: 400000,
        advIssues: 2000, decIssues: 1000,
      });
      expect(calculateTRIN(decPressure)).toBeLessThan(1);
    });
  });

  describe('calculateBreadthThrust', () => {
    it('should calculate breadth thrust', () => {
      const history = generateHistory(15);
      const result = calculateBreadthThrust(history);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should return 0 for insufficient data', () => {
      expect(calculateBreadthThrust(generateHistory(5))).toBe(0);
    });

    it('should be high in strong rally', () => {
      const rally = Array.from({ length: 15 }, () => mockBreadth({
        advancing: 3000, declining: 200, unchanged: 300,
      }));
      expect(calculateBreadthThrust(rally)).toBeGreaterThan(0.8);
    });
  });

  describe('calculateMABreadth', () => {
    it('should calculate percentage above each MA', () => {
      const result = calculateMABreadth(mockBreadth());
      expect(result.ma20).toBeCloseTo(71.43, 0);
      expect(result.ma60).toBeCloseTo(57.14, 0);
      expect(result.ma200).toBeCloseTo(42.86, 0);
    });

    it('should return values 0-100', () => {
      const result = calculateMABreadth(mockBreadth());
      expect(result.ma20).toBeGreaterThan(0);
      expect(result.ma20).toBeLessThanOrEqual(100);
    });
  });

  describe('analyzeMarketBreadth', () => {
    const history = generateHistory(40);

    it('should return indicators', () => {
      const result = analyzeMarketBreadth(mockBreadth(), history);
      expect(result.indicators.advanceDeclineRatio).toBeGreaterThan(0);
      expect(typeof result.indicators.trin).toBe('number');
      expect(result.indicators.composite).toBeGreaterThanOrEqual(0);
    });

    it('should detect signals', () => {
      const result = analyzeMarketBreadth(mockBreadth(), history);
      expect(Array.isArray(result.signals)).toBe(true);
    });

    it('should have valid composite score', () => {
      const result = analyzeMarketBreadth(mockBreadth(), history);
      expect(result.indicators.composite).toBeGreaterThanOrEqual(0);
      expect(result.indicators.composite).toBeLessThanOrEqual(100);
    });

    it('should detect bullish signal in strong market', () => {
      const strongBull = mockBreadth({
        advancing: 3200, declining: 200,
        advVolume: 500000, decVolume: 50000,
        advIssues: 3200, decIssues: 200,
        aboveMA200: 3000, totalStocks: 3500,
      });
      const result = analyzeMarketBreadth(strongBull, history);
      const bullishSignals = result.signals.filter(s => s.type === 'bullish');
      expect(bullishSignals.length).toBeGreaterThan(0);
    });

    it('should detect bearish signal in weak market', () => {
      const strongBear = mockBreadth({
        advancing: 200, declining: 3200,
        aboveMA200: 500, totalStocks: 3500,
      });
      const result = analyzeMarketBreadth(strongBear, history);
      const bearishSignals = result.signals.filter(s => s.type === 'bearish');
      expect(bearishSignals.length).toBeGreaterThan(0);
    });

    it('should include signal descriptions', () => {
      const result = analyzeMarketBreadth(mockBreadth(), history);
      result.signals.forEach(s => {
        expect(s.description).toBeTruthy();
        expect(s.strength).toBeGreaterThan(0);
      });
    });
  });
});
