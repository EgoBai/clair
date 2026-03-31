import { describe, it, expect } from 'vitest';
import {
  calculateVWAP,
  calculateOrderFlowImbalance,
  calculateVolumeProfile,
  detectMicroPatterns,
  estimatePriceImpact,
  type TickData,
} from '../utils/highFrequencyEngine';

const mockTick = (overrides: Partial<TickData> = {}): TickData => ({
  timestamp: Date.now(),
  price: 10.5,
  volume: 1000,
  direction: 'buy',
  bidPrice: 10.49,
  askPrice: 10.51,
  bidSize: 500,
  askSize: 600,
  ...overrides,
});

function generateTicks(count: number, startPrice: number = 10): TickData[] {
  const ticks: TickData[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.5) * 0.02;
    ticks.push(mockTick({
      timestamp: Date.now() + i * 1000,
      price,
      volume: 500 + Math.round(Math.random() * 1000),
      direction: Math.random() > 0.5 ? 'buy' : 'sell',
      bidPrice: price - 0.01,
      askPrice: price + 0.01,
    }));
  }
  return ticks;
}

describe('高频数据流引擎', () => {
  describe('calculateVWAP', () => {
    it('should calculate VWAP', () => {
      const ticks = generateTicks(100);
      const result = calculateVWAP(ticks);
      expect(result.vwap).toBeGreaterThan(0);
    });

    it('should include bands', () => {
      const ticks = generateTicks(100);
      const result = calculateVWAP(ticks);
      expect(result.upperBand).toBeGreaterThan(result.vwap);
      expect(result.lowerBand).toBeLessThan(result.vwap);
    });

    it('should handle empty ticks', () => {
      const result = calculateVWAP([]);
      expect(result.vwap).toBe(0);
    });

    it('should calculate deviation', () => {
      const ticks = generateTicks(50);
      const result = calculateVWAP(ticks);
      expect(typeof result.deviation).toBe('number');
    });
  });

  describe('calculateOrderFlowImbalance', () => {
    it('should calculate buy/sell volumes', () => {
      const ticks = [
        mockTick({ direction: 'buy', volume: 1000 }),
        mockTick({ direction: 'sell', volume: 500 }),
        mockTick({ direction: 'buy', volume: 800 }),
      ];
      const result = calculateOrderFlowImbalance(ticks);
      expect(result.buyVolume).toBe(1800);
      expect(result.sellVolume).toBe(500);
    });

    it('should determine aggressor side', () => {
      const buyTicks = Array.from({ length: 10 }, () => mockTick({ direction: 'buy', volume: 1000 }));
      const result = calculateOrderFlowImbalance(buyTicks);
      expect(result.aggressorSide).toBe('buy');
    });

    it('should calculate imbalance ratio', () => {
      const ticks = generateTicks(50);
      const result = calculateOrderFlowImbalance(ticks);
      expect(result.imbalanceRatio).toBeGreaterThanOrEqual(-1);
      expect(result.imbalanceRatio).toBeLessThanOrEqual(1);
    });

    it('should handle empty ticks', () => {
      const result = calculateOrderFlowImbalance([]);
      expect(result.buyVolume).toBe(0);
      expect(result.netVolume).toBe(0);
    });

    it('should calculate pressure 0-100', () => {
      const ticks = generateTicks(50);
      const result = calculateOrderFlowImbalance(ticks);
      expect(result.pressure).toBeGreaterThanOrEqual(0);
      expect(result.pressure).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateVolumeProfile', () => {
    it('should calculate volume at price levels', () => {
      const ticks = generateTicks(200);
      const profile = calculateVolumeProfile(ticks, 0.05);
      expect(profile.length).toBeGreaterThan(0);
    });

    it('should identify POC', () => {
      const ticks = generateTicks(200);
      const profile = calculateVolumeProfile(ticks, 0.05);
      const poc = profile.find(p => p.poc === 1);
      expect(poc).toBeDefined();
    });

    it('should include buy/sell breakdown', () => {
      const ticks = generateTicks(50);
      const profile = calculateVolumeProfile(ticks, 0.05);
      profile.forEach(p => {
        expect(p.volume).toBe(p.buyVolume + p.sellVolume);
      });
    });

    it('should set value area', () => {
      const ticks = generateTicks(200);
      const profile = calculateVolumeProfile(ticks, 0.05);
      if (profile.length > 0) {
        expect(profile[0].valueAreaHigh).toBeGreaterThanOrEqual(profile[0].valueAreaLow);
      }
    });

    it('should handle empty ticks', () => {
      const profile = calculateVolumeProfile([], 0.01);
      expect(profile).toHaveLength(0);
    });
  });

  describe('detectMicroPatterns', () => {
    it('should detect patterns', () => {
      const ticks = generateTicks(50);
      const patterns = detectMicroPatterns(ticks);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should include uptick/downtick ratio', () => {
      const ticks = generateTicks(50);
      const patterns = detectMicroPatterns(ticks);
      expect(patterns.some(p => p.pattern === 'uptick_downtick_ratio')).toBe(true);
    });

    it('should include price momentum', () => {
      const ticks = generateTicks(50);
      const patterns = detectMicroPatterns(ticks);
      expect(patterns.some(p => p.pattern === 'price_momentum')).toBe(true);
    });

    it('should include description', () => {
      const ticks = generateTicks(50);
      const patterns = detectMicroPatterns(ticks);
      patterns.forEach(p => {
        expect(p.description).toBeTruthy();
        expect(p.strength).toBeGreaterThanOrEqual(0);
      });
    });

    it('should return empty for insufficient ticks', () => {
      expect(detectMicroPatterns(generateTicks(5))).toHaveLength(0);
    });
  });

  describe('estimatePriceImpact', () => {
    it('should estimate impact costs', () => {
      const ticks = generateTicks(100);
      const result = estimatePriceImpact(ticks, 5000);
      expect(result.totalImpact).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty ticks', () => {
      const result = estimatePriceImpact([], 1000);
      expect(result.totalImpact).toBe(0);
    });

    it('should include cost estimate', () => {
      const ticks = generateTicks(100);
      const result = estimatePriceImpact(ticks, 10000);
      expect(result.costEstimate).toBeGreaterThanOrEqual(0);
    });

    it('should separate temporary and permanent impact', () => {
      const ticks = generateTicks(100);
      const result = estimatePriceImpact(ticks, 5000);
      expect(result.temporaryImpact).toBeGreaterThanOrEqual(0);
      expect(result.permanentImpact).toBeGreaterThanOrEqual(0);
    });
  });
});
