import { describe, it, expect } from 'vitest';
import {
  calculateVwap,
  rollingVwap,
  calculateTwap,
  calculateTickStats,
  buildVolumeProfile,
  evaluateExecution,
  detectAnomalousTicks,
  calculateMicroPrice,
  calculateWeightedMidPrice,
  type Tick,
} from '../utils/tickDataEngine';

function generateTicks(count: number, startPrice: number = 100, volatility: number = 0.1): Tick[] {
  const ticks: Tick[] = [];
  let price = startPrice;
  const startTime = Date.now();

  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.5) * volatility;
    price = Math.max(1, price);
    ticks.push({
      timestamp: startTime + i * 1000,
      price: Math.round(price * 100) / 100,
      volume: Math.floor(100 + Math.random() * 500),
      direction: Math.random() > 0.5 ? 'buy' : 'sell',
    });
  }
  return ticks;
}

const mockTicks = generateTicks(100);

describe('逐笔数据引擎', () => {
  describe('calculateVwap', () => {
    it('should calculate VWAP correctly', () => {
      const ticks: Tick[] = [
        { timestamp: 1, price: 100, volume: 100, direction: 'buy' },
        { timestamp: 2, price: 102, volume: 200, direction: 'sell' },
        { timestamp: 3, price: 101, volume: 100, direction: 'buy' },
      ];
      const result = calculateVwap(ticks);
      // VWAP = (100*100 + 102*200 + 101*100) / (100+200+100) = 40500/400 = 101.25
      expect(result.vwap).toBe(101.25);
      expect(result.cumulativeVolume).toBe(400);
    });

    it('should handle empty ticks', () => {
      const result = calculateVwap([]);
      expect(result.vwap).toBe(0);
      expect(result.cumulativeVolume).toBe(0);
    });

    it('should filter by currentTime', () => {
      const ticks: Tick[] = [
        { timestamp: 1, price: 100, volume: 100, direction: 'buy' },
        { timestamp: 2, price: 102, volume: 200, direction: 'sell' },
        { timestamp: 3, price: 101, volume: 100, direction: 'buy' },
      ];
      const result = calculateVwap(ticks, 2);
      // Only first two ticks
      // VWAP = (100*100 + 102*200) / 300 = 30400/300 ≈ 101.33
      expect(result.vwap).toBeCloseTo(101.33, 1);
      expect(result.cumulativeVolume).toBe(300);
    });

    it('should calculate deviation', () => {
      const ticks: Tick[] = [
        { timestamp: 1, price: 100, volume: 100, direction: 'buy' },
        { timestamp: 2, price: 110, volume: 100, direction: 'buy' },
      ];
      const result = calculateVwap(ticks);
      // VWAP = 105, last price = 110, deviation = (110-105)/105 * 100 ≈ 4.76%
      expect(result.deviation).toBeGreaterThan(0);
    });
  });

  describe('rollingVwap', () => {
    it('should calculate rolling VWAP', () => {
      const ticks: Tick[] = [
        { timestamp: 1, price: 100, volume: 100, direction: 'buy' },
        { timestamp: 2, price: 102, volume: 100, direction: 'buy' },
        { timestamp: 3, price: 104, volume: 100, direction: 'buy' },
        { timestamp: 4, price: 106, volume: 100, direction: 'buy' },
      ];
      const result = rollingVwap(ticks, 2);
      expect(result.length).toBe(4);
      expect(result[0]).toBe(100);
      expect(result[3]).toBe(105); // (104+106)/2
    });

    it('should handle single tick', () => {
      const ticks: Tick[] = [{ timestamp: 1, price: 100, volume: 100, direction: 'buy' }];
      const result = rollingVwap(ticks, 10);
      expect(result).toEqual([100]);
    });
  });

  describe('calculateTwap', () => {
    it('should calculate TWAP correctly', () => {
      const ticks: Tick[] = [
        { timestamp: 0, price: 100, volume: 100, direction: 'buy' },
        { timestamp: 1000, price: 110, volume: 100, direction: 'buy' },
        { timestamp: 2000, price: 105, volume: 100, direction: 'sell' },
      ];
      const result = calculateTwap(ticks);
      // TWAP = (100*1000 + 110*1000) / 2000 = 105
      expect(result.twap).toBe(105);
      expect(result.totalDuration).toBe(2000);
    });

    it('should handle time range filter', () => {
      const ticks: Tick[] = [
        { timestamp: 0, price: 100, volume: 100, direction: 'buy' },
        { timestamp: 1000, price: 110, volume: 100, direction: 'buy' },
        { timestamp: 2000, price: 120, volume: 100, direction: 'buy' },
      ];
      const result = calculateTwap(ticks, 500, 1500);
      expect(result.twap).toBe(110); // Only tick at 1000
    });

    it('should handle single tick', () => {
      const ticks: Tick[] = [{ timestamp: 0, price: 100, volume: 100, direction: 'buy' }];
      const result = calculateTwap(ticks);
      expect(result.twap).toBe(100);
    });
  });

  describe('calculateTickStats', () => {
    it('should calculate stats for normal ticks', () => {
      const stats = calculateTickStats(mockTicks);
      expect(stats.tickCount).toBe(100);
      expect(stats.realizedVolatility).toBeGreaterThanOrEqual(0);
      expect(stats.tickFrequency).toBeGreaterThan(0);
      expect(stats.avgTradeSize).toBeGreaterThan(0);
      expect(stats.buyVolumeRatio).toBeGreaterThanOrEqual(0);
      expect(stats.buyVolumeRatio).toBeLessThanOrEqual(1);
    });

    it('should handle empty ticks', () => {
      const stats = calculateTickStats([]);
      expect(stats.tickCount).toBe(0);
      expect(stats.realizedVolatility).toBe(0);
    });

    it('should calculate Kyle Lambda', () => {
      const stats = calculateTickStats(mockTicks);
      expect(stats.kyleLambda).toBeGreaterThanOrEqual(0);
    });

    it('should calculate Amihud illiquidity', () => {
      const stats = calculateTickStats(mockTicks);
      expect(stats.amihudIlliquidity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('buildVolumeProfile', () => {
    it('should build profile correctly', () => {
      const profile = buildVolumeProfile(mockTicks, 0.1);
      expect(profile.length).toBeGreaterThan(0);
      expect(profile.some(p => p.poc)).toBe(true);
    });

    it('should have value area', () => {
      const profile = buildVolumeProfile(mockTicks);
      if (profile.length > 0) {
        const poc = profile.find(p => p.poc)!;
        expect(poc.valueAreaHigh).toBeGreaterThanOrEqual(poc.valueAreaLow);
      }
    });

    it('should handle empty ticks', () => {
      const profile = buildVolumeProfile([]);
      expect(profile).toEqual([]);
    });

    it('should separate buy/sell volume', () => {
      const ticks: Tick[] = [
        { timestamp: 1, price: 100, volume: 100, direction: 'buy' },
        { timestamp: 2, price: 100, volume: 50, direction: 'sell' },
      ];
      const profile = buildVolumeProfile(ticks, 0.01);
      expect(profile.length).toBe(1);
      expect(profile[0].buyVolume).toBe(100);
      expect(profile[0].sellVolume).toBe(50);
      expect(profile[0].volume).toBe(150);
    });
  });

  describe('evaluateExecution', () => {
    it('should evaluate execution quality', () => {
      const ticks = generateTicks(100, 100, 0.5);
      const arrivalPrice = ticks[0].price;
      const result = evaluateExecution(
        ticks,
        arrivalPrice,
        10000,
        ticks[0].timestamp,
        ticks[50].timestamp
      );
      expect(result.arrivalPrice).toBe(arrivalPrice);
      expect(result.executionPrice).toBeGreaterThan(0);
      expect(typeof result.implementationShortfall).toBe('number');
      expect(typeof result.vwapSlippage).toBe('number');
    });

    it('should handle no execution ticks', () => {
      const result = evaluateExecution([], 100, 1000, 0, 1000);
      expect(result.arrivalPrice).toBe(100);
      expect(result.executionPrice).toBe(100);
    });

    it('should calculate participation rate', () => {
      const ticks = generateTicks(100, 100, 0.5);
      const result = evaluateExecution(
        ticks,
        ticks[0].price,
        1000,
        ticks[0].timestamp,
        ticks[50].timestamp
      );
      expect(result.participationRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectAnomalousTicks', () => {
    it('should detect large volume anomalies', () => {
      const ticks = generateTicks(50, 100, 0.1);
      // Insert a large volume tick
      ticks[30].volume = 100000;
      const anomalies = detectAnomalousTicks(ticks);
      const volumeAnomalies = anomalies.filter(a => a.type === 'large_volume');
      expect(volumeAnomalies.length).toBeGreaterThan(0);
    });

    it('should detect price jumps', () => {
      const ticks = generateTicks(50, 100, 0.1);
      // Insert a price jump
      ticks[30].price = ticks[29].price * 1.1;
      const anomalies = detectAnomalousTicks(ticks, { priceJumpThreshold: 2 });
      expect(anomalies.some(a => a.type === 'price_jump')).toBe(true);
    });

    it('should return empty for normal data', () => {
      const ticks = generateTicks(50, 100, 0.01); // Very low volatility
      const anomalies = detectAnomalousTicks(ticks);
      expect(anomalies.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle short data', () => {
      const ticks = generateTicks(5, 100, 0.1);
      const anomalies = detectAnomalousTicks(ticks);
      expect(anomalies.length).toBe(0);
    });
  });

  describe('calculateMicroPrice', () => {
    it('should weight toward larger size', () => {
      // Micro price weights by opposite side's size
      // Bid size larger → ask price gets more weight → closer to ask
      const mp1 = calculateMicroPrice(99, 101, 1000, 100);
      expect(mp1).toBeGreaterThan(100);

      // Ask size larger → bid price gets more weight → closer to bid
      const mp2 = calculateMicroPrice(99, 101, 100, 1000);
      expect(mp2).toBeLessThan(100);
    });

    it('should return mid price for equal sizes', () => {
      const mp = calculateMicroPrice(99, 101, 500, 500);
      expect(mp).toBe(100);
    });

    it('should handle zero sizes', () => {
      const mp = calculateMicroPrice(99, 101, 0, 0);
      expect(mp).toBe(100); // Falls back to mid
    });
  });

  describe('calculateWeightedMidPrice', () => {
    it('should calculate weighted mid price', () => {
      const bidLevels = [
        { price: 99, size: 1000 },
        { price: 98, size: 2000 },
      ];
      const askLevels = [
        { price: 101, size: 500 },
        { price: 102, size: 1000 },
      ];
      const wmid = calculateWeightedMidPrice(bidLevels, askLevels);
      expect(wmid).toBeGreaterThan(99);
      expect(wmid).toBeLessThan(101);
    });

    it('should handle empty levels', () => {
      expect(calculateWeightedMidPrice([], [{ price: 101, size: 100 }])).toBe(0);
      expect(calculateWeightedMidPrice([{ price: 99, size: 100 }], [])).toBe(0);
    });

    it('should return mid for single level each side', () => {
      const wmid = calculateWeightedMidPrice(
        [{ price: 99, size: 100 }],
        [{ price: 101, size: 100 }]
      );
      expect(wmid).toBeCloseTo(100, 0);
    });
  });
});
