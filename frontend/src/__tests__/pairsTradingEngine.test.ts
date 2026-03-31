import { describe, it, expect } from 'vitest';
import {
  calculateHedgeRatio,
  calculateSpread,
  testCointegration,
  generateSpreadSignals,
  backtestPairs,
  rankPairs,
  type PairData,
} from '../utils/pairsTradingEngine';

// 生成协整的价格对
function generateCointegratedPair(n: number): { pricesA: number[]; pricesB: number[] } {
  const pricesA: number[] = [100];
  const pricesB: number[] = [50];
  let spread = 0;

  for (let i = 1; i < n; i++) {
    // 价差均值回归
    spread = spread * 0.95 + (Math.random() - 0.5) * 2;
    const hedgeRatio = 2;
    pricesA.push(pricesA[i - 1] + (Math.random() - 0.5) * 0.5);
    pricesB.push((pricesA[i] - spread) / hedgeRatio);
  }

  return { pricesA, pricesB };
}

// 生成不协整的价格对
function generateRandomPair(n: number): { pricesA: number[]; pricesB: number[] } {
  const pricesA: number[] = [100];
  const pricesB: number[] = [50];
  for (let i = 1; i < n; i++) {
    pricesA.push(pricesA[i - 1] * (1 + (Math.random() - 0.48) * 0.02));
    pricesB.push(pricesB[i - 1] * (1 + (Math.random() - 0.48) * 0.02));
  }
  return { pricesA, pricesB };
}

describe('配对交易引擎', () => {
  describe('calculateHedgeRatio', () => {
    it('should return 2 for 2:1 price relationship', () => {
      const pricesA = [100, 102, 104, 106, 108];
      const pricesB = [50, 51, 52, 53, 54];
      const hr = calculateHedgeRatio(pricesA, pricesB);
      expect(hr).toBeCloseTo(2, 0);
    });

    it('should handle equal prices', () => {
      const pricesA = [100, 101, 102, 103];
      const pricesB = [100, 101, 102, 103];
      const hr = calculateHedgeRatio(pricesA, pricesB);
      expect(hr).toBeCloseTo(1, 0);
    });

    it('should return 1 for insufficient data', () => {
      expect(calculateHedgeRatio([100], [50])).toBe(1);
    });
  });

  describe('calculateSpread', () => {
    it('should compute A - hedgeRatio * B', () => {
      const spread = calculateSpread([100, 102], [50, 51], 2);
      expect(spread[0]).toBeCloseTo(0, 5);
      expect(spread[1]).toBeCloseTo(0, 5);
    });
  });

  describe('testCointegration', () => {
    it('should return valid cointegration result', () => {
      const { pricesA, pricesB } = generateCointegratedPair(200);
      const result = testCointegration(pricesA, pricesB);
      expect(result.hedgeRatio).toBeGreaterThan(0);
      expect(result.halfLife).toBeGreaterThanOrEqual(0);
      expect(result.hurstExponent).toBeGreaterThanOrEqual(0);
      expect(result.hurstExponent).toBeLessThanOrEqual(1);
      expect(typeof result.isCointegrated).toBe('boolean');
    });

    it('should not detect cointegration in random pair', () => {
      const { pricesA, pricesB } = generateRandomPair(200);
      const result = testCointegration(pricesA, pricesB);
      // 随机价格不太可能是协整的
      expect(result.isCointegrated).toBe(false);
    });

    it('should handle short data', () => {
      const result = testCointegration([1, 2, 3], [2, 3, 4]);
      expect(result.isCointegrated).toBe(false);
      expect(result.halfLife).toBe(0);
    });

    it('should compute spread statistics', () => {
      const { pricesA, pricesB } = generateCointegratedPair(100);
      const result = testCointegration(pricesA, pricesB);
      expect(result.spreadStd).toBeGreaterThan(0);
    });
  });

  describe('generateSpreadSignals', () => {
    it('should generate long signal on low z-score', () => {
      const mean = 100;
      const std = 10;
      const spread = [100, 100, 79, 100, 100]; // z-score = -2.1 at index 2
      const signals = generateSpreadSignals(spread, mean, std, 2.0, 0.5);
      expect(signals[2].signal).toBe('long');
    });

    it('should generate short signal on high z-score', () => {
      const mean = 100;
      const std = 10;
      const spread = [100, 100, 121, 100, 100]; // z-score = 2.1 at index 2
      const signals = generateSpreadSignals(spread, mean, std, 2.0, 0.5);
      expect(signals[2].signal).toBe('short');
    });

    it('should generate exit signal', () => {
      const mean = 100;
      const std = 10;
      const spread = [100, 79, 98]; // long at 79 (z=-2.1), exit at 98 (z=-0.2)
      const signals = generateSpreadSignals(spread, mean, std, 2.0, 0.5);
      expect(signals[1].signal).toBe('long');
      expect(signals[2].signal).toBe('exit');
    });

    it('should hold in normal range', () => {
      const spread = [100, 101, 99, 100, 101];
      const signals = generateSpreadSignals(spread, 100, 10, 2.0, 0.5);
      for (const s of signals) {
        expect(s.signal).toBe('hold');
      }
    });
  });

  describe('backtestPairs', () => {
    it('should return valid metrics', () => {
      const { pricesA, pricesB } = generateCointegratedPair(200);
      const ci = testCointegration(pricesA, pricesB);
      const result = backtestPairs(pricesA, pricesB, ci);

      expect(result.numTrades).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
      expect(result.signals.length).toBeGreaterThan(0);
    });
  });

  describe('rankPairs', () => {
    it('should rank pairs by score', () => {
      const pairs: PairData[] = [
        {
          symbolA: 'A', symbolB: 'B',
          ...generateCointegratedPair(200)
        },
        {
          symbolA: 'C', symbolB: 'D',
          ...generateRandomPair(200)
        }
      ];

      const ranked = rankPairs(pairs);
      expect(ranked.length).toBe(2);
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    });
  });
});
