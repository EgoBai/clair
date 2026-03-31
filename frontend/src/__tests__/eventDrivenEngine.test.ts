import { describe, it, expect } from 'vitest';
import {
  analyzeEventImpact,
  analyzeEarningsSurprises,
  backtestEventStrategy,
  analyzeDividendEffect,
  type Event,
  type EarningsSurprise,
  type EventStrategy,
} from '../utils/eventDrivenEngine';

function createDate(daysFromStart: number): Date {
  return new Date(2024, 0, 1 + daysFromStart);
}

describe('事件驱动交易引擎', () => {
  describe('analyzeEventImpact', () => {
    it('should calculate impact metrics per event type', () => {
      const events: Event[] = [
        { type: 'earnings', date: createDate(10), symbol: 'A', details: {} },
        { type: 'earnings', date: createDate(30), symbol: 'A', details: {} },
        { type: 'dividend', date: createDate(15), symbol: 'A', details: {} },
      ];

      const prices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.random());
      const priceData = new Map([['A', prices]]);
      const dates = Array.from({ length: 60 }, (_, i) => createDate(i));

      const result = analyzeEventImpact(events, priceData, dates);
      expect(result.length).toBeGreaterThan(0);
      for (const impact of result) {
        expect(impact.sampleSize).toBeGreaterThan(0);
        expect(impact.volatility).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle missing price data', () => {
      const events: Event[] = [
        { type: 'earnings', date: createDate(10), symbol: 'MISSING', details: {} },
      ];
      const priceData = new Map<string, number[]>();
      const dates = Array.from({ length: 60 }, (_, i) => createDate(i));

      const result = analyzeEventImpact(events, priceData, dates);
      expect(result.length).toBe(1);
      expect(result[0].sampleSize).toBe(1);
    });
  });

  describe('analyzeEarningsSurprises', () => {
    it('should calculate surprise statistics', () => {
      const surprises: EarningsSurprise[] = [
        { symbol: 'A', reportDate: createDate(10), actualEPS: 1.2, estimatedEPS: 1.0, surprisePct: 20, preEventPrice: 100, postEventPrice: 105, return1d: 0.05, return5d: 0.08, return20d: 0.10 },
        { symbol: 'B', reportDate: createDate(15), actualEPS: 0.8, estimatedEPS: 1.0, surprisePct: -20, preEventPrice: 50, postEventPrice: 48, return1d: -0.04, return5d: -0.02, return20d: 0.01 },
        { symbol: 'C', reportDate: createDate(20), actualEPS: 1.5, estimatedEPS: 1.2, surprisePct: 25, preEventPrice: 80, postEventPrice: 85, return1d: 0.06, return5d: 0.10, return20d: 0.12 },
      ];

      const result = analyzeEarningsSurprises(surprises);
      expect(result.avgSurprise).toBeGreaterThan(0);
      expect(result.positiveSurpriseWinRate).toBe(1); // 2 positive surprises, both had positive 5d returns
      expect(result.topSurprises.length).toBeLessThanOrEqual(3);
    });

    it('should handle empty array', () => {
      const result = analyzeEarningsSurprises([]);
      expect(result.avgSurprise).toBe(0);
      expect(result.positiveSurpriseWinRate).toBe(0);
    });
  });

  describe('backtestEventStrategy', () => {
    it('should return trades for matching events', () => {
      const strategy: EventStrategy = {
        eventType: 'earnings',
        entryTiming: 'before',
        entryDays: 2,
        exitDays: 5,
        stopLoss: 0.05,
        takeProfit: 0.10,
        positionSize: 0.1
      };

      const events: Event[] = [
        { type: 'earnings', date: createDate(10), symbol: 'A', details: {} },
        { type: 'earnings', date: createDate(30), symbol: 'A', details: {} },
      ];

      const prices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.3 + Math.random() * 2);
      const priceData = new Map([['A', prices]]);
      const dates = Array.from({ length: 60 }, (_, i) => createDate(i));

      const result = backtestEventStrategy(strategy, events, priceData, dates);
      expect(result.totalTrades).toBe(2);
      expect(result.trades.length).toBe(2);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it('should handle stop loss', () => {
      const strategy: EventStrategy = {
        eventType: 'earnings',
        entryTiming: 'on',
        entryDays: 0,
        exitDays: 20,
        stopLoss: 0.02,
        takeProfit: 1.0,
        positionSize: 0.1
      };

      const events: Event[] = [
        { type: 'earnings', date: createDate(5), symbol: 'A', details: {} },
      ];

      // 下跌的价格
      const prices = [100, 100, 100, 100, 100, 100, 97, 95, 93, 90, 88, 85, 83, 80, 78, 75, 73, 70, 68, 65, 63, 60, 58, 55, 53, 50, 48, 45, 43, 40];
      const priceData = new Map([['A', prices]]);
      const dates = Array.from({ length: 30 }, (_, i) => createDate(i));

      const result = backtestEventStrategy(strategy, events, priceData, dates);
      expect(result.totalTrades).toBe(1);
      // 止损应该触发
      expect(result.trades[0].return).toBeLessThan(0);
    });

    it('should skip non-matching events', () => {
      const strategy: EventStrategy = {
        eventType: 'dividend',
        entryTiming: 'on',
        entryDays: 0,
        exitDays: 5,
        stopLoss: 0.05,
        takeProfit: 0.10,
        positionSize: 0.1
      };

      const events: Event[] = [
        { type: 'earnings', date: createDate(10), symbol: 'A', details: {} },
      ];

      const priceData = new Map([['A', Array(60).fill(100)]]);
      const dates = Array.from({ length: 60 }, (_, i) => createDate(i));

      const result = backtestEventStrategy(strategy, events, priceData, dates);
      expect(result.totalTrades).toBe(0);
    });
  });

  describe('analyzeDividendEffect', () => {
    it('should calculate price adjustment', () => {
      const prices = [100, 98, 99, 100, 101, 102]; // 除权日价格下跌2
      const dates = Array.from({ length: 6 }, (_, i) => createDate(i));
      const result = analyzeDividendEffect(createDate(1), 2, prices, dates);

      expect(result.priceAdjustment).toBeCloseTo(0.02, 5);
      expect(result.actualDrop).toBeCloseTo(0.02, 5);
    });

    it('should find recovery days', () => {
      const prices = [100, 90, 92, 95, 98, 100, 102]; // 除权后4天恢复到100
      const dates = Array.from({ length: 7 }, (_, i) => createDate(i));
      const result = analyzeDividendEffect(createDate(1), 10, prices, dates);

      expect(result.recoveryDays).toBe(4);
    });

    it('should handle no recovery', () => {
      const prices = [100, 90, 89, 88, 87, 86, 85];
      const dates = Array.from({ length: 7 }, (_, i) => createDate(i));
      const result = analyzeDividendEffect(createDate(1), 10, prices, dates);

      expect(result.recoveryDays).toBeNull();
    });
  });
});
