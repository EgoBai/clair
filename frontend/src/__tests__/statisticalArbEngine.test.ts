import { describe, it, expect } from 'vitest';
import {
  meanReversionSignal,
  volatilityArbSignal,
  calendarSpreadSignal,
  scanArbitrageOpportunities,
} from '../utils/statisticalArbEngine';

describe('统计套利引擎', () => {
  describe('meanReversionSignal', () => {
    it('should generate signal when price deviates', () => {
      // 均值100，当前偏离的序列
      const prices = Array.from({ length: 60 }, () => 100 + (Math.random() - 0.5) * 2);
      prices.push(90); // 极端偏离

      const result = meanReversionSignal(prices, {
        lookback: 60, entryZScore: 2.0, exitZScore: 0.5, stopZScore: 3.0
      });

      expect(result).not.toBeNull();
      expect(result!.entrySignal).toBeGreaterThan(0);
      expect(result!.halfLife).toBeGreaterThan(0);
    });

    it('should return null for insufficient data', () => {
      const result = meanReversionSignal([1, 2, 3], {
        lookback: 60, entryZScore: 2.0, exitZScore: 0.5, stopZScore: 3.0
      });
      expect(result).toBeNull();
    });

    it('should return near-zero signal for no deviation', () => {
      const prices = Array.from({ length: 60 }, () => 100 + (Math.random() - 0.5) * 0.5);
      const result = meanReversionSignal(prices, {
        lookback: 60, entryZScore: 2.0, exitZScore: 0.5, stopZScore: 3.0
      });
      expect(result).not.toBeNull();
      expect(Math.abs(result!.entrySignal)).toBeLessThan(0.1);
    });

    it('should have correct type', () => {
      const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const result = meanReversionSignal(prices, {
        lookback: 60, entryZScore: 1.0, exitZScore: 0.3, stopZScore: 3.0
      });
      expect(result?.type).toBe('mean_reversion');
    });
  });

  describe('volatilityArbSignal', () => {
    it('should signal sell vol when IV >> RV and high percentile', () => {
      const result = volatilityArbSignal({
        impliedVol: 0.35,
        realizedVol: 0.20,
        volSpread: 0.15,
        historicalPercentile: 90
      });

      expect(result).not.toBeNull();
      expect(result!.entrySignal).toBeLessThan(0); // 做空
    });

    it('should signal buy vol when IV << RV and low percentile', () => {
      const result = volatilityArbSignal({
        impliedVol: 0.10,
        realizedVol: 0.25,
        volSpread: -0.15,
        historicalPercentile: 10
      });

      expect(result).not.toBeNull();
      expect(result!.entrySignal).toBeGreaterThan(0); // 做多
    });
  });

  describe('calendarSpreadSignal', () => {
    it('should detect spread deviation', () => {
      const near = Array.from({ length: 60 }, () => 100 + (Math.random() - 0.5) * 2);
      const far = near.map(p => p + 5 + (Math.random() - 0.5) * 1);
      far.push(far[far.length - 1] + 10); // 异常价差

      const result = calendarSpreadSignal(near, far, 60);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('calendar_spread');
    });

    it('should return null for insufficient data', () => {
      const result = calendarSpreadSignal([1, 2], [2, 3], 60);
      expect(result).toBeNull();
    });
  });

  describe('scanArbitrageOpportunities', () => {
    it('should scan all assets', () => {
      const data = new Map([
        ['A', Array.from({ length: 100 }, () => 100 + (Math.random() - 0.5) * 20)],
        ['B', Array.from({ length: 100 }, () => 50 + (Math.random() - 0.5) * 10)],
        ['C', Array.from({ length: 100 }, () => 80 + (Math.random() - 0.5) * 15)],
      ]);

      const opportunities = scanArbitrageOpportunities(data, 60, 0);
      expect(Array.isArray(opportunities)).toBe(true);
      for (const opp of opportunities) {
        expect(opp.sharpeEstimate).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return empty for flat prices', () => {
      const data = new Map([
        ['A', Array(100).fill(100)],
      ]);
      const opportunities = scanArbitrageOpportunities(data, 60, 0);
      // 常数价格没有套利机会
      expect(opportunities.length).toBe(0);
    });

    it('should sort by sharpe estimate', () => {
      const data = new Map([
        ['A', Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 15)],
        ['B', Array.from({ length: 100 }, (_, i) => 50 + Math.sin(i / 3) * 8)],
      ]);

      const opportunities = scanArbitrageOpportunities(data, 60, 0);
      for (let i = 1; i < opportunities.length; i++) {
        expect(opportunities[i].sharpeEstimate).toBeLessThanOrEqual(
          opportunities[i - 1].sharpeEstimate + 0.001
        );
      }
    });
  });
});
