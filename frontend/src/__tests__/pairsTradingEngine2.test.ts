import { describe, it, expect } from 'vitest';
import {
  testCointegration,
  analyzeSpread,
  generatePairSignal,
  PairData,
} from '../utils/pairsTradingEngine2';

function makePair(n = 100): PairData {
  const base = Array.from({ length: n }, (_, i) => 100 + i * 0.1 + Math.sin(i * 0.2) * 5);
  return {
    tickerA: '600519',
    tickerB: '000858',
    pricesA: base.map(v => v + Math.random() * 2),
    pricesB: base.map(v => v * 0.8 + Math.random() * 2),
    dates: Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`),
  };
}

describe('Pairs Trading Engine', () => {
  describe('testCointegration', () => {
    it('应检验协整关系', () => {
      const result = testCointegration(makePair());
      expect(typeof result.isCointegrated).toBe('boolean');
      expect(typeof result.hedgeRatio).toBe('number');
    });

    it('应计算对冲比率', () => {
      const result = testCointegration(makePair());
      expect(result.hedgeRatio).toBeGreaterThan(0);
    });

    it('应计算价差统计', () => {
      const result = testCointegration(makePair());
      expect(result.spreadStd).toBeGreaterThanOrEqual(0);
    });

    it('应计算半衰期', () => {
      const result = testCointegration(makePair());
      expect(result.halfLife).toBeGreaterThan(0);
    });

    it('应计算R方', () => {
      const result = testCointegration(makePair());
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.rSquared).toBeLessThanOrEqual(1);
    });

    it('应处理数据不足', () => {
      const result = testCointegration(makePair(5));
      expect(result.isCointegrated).toBe(false);
    });
  });

  describe('analyzeSpread', () => {
    it('应计算当前价差', () => {
      const pair = makePair();
      const ci = testCointegration(pair);
      const result = analyzeSpread(pair, ci);
      expect(typeof result.currentSpread).toBe('number');
    });

    it('应计算Z-Score', () => {
      const pair = makePair();
      const ci = testCointegration(pair);
      const result = analyzeSpread(pair, ci);
      expect(typeof result.zScore).toBe('number');
    });

    it('应判断交易信号', () => {
      const pair = makePair();
      const ci = testCointegration(pair);
      const result = analyzeSpread(pair, ci);
      expect(['long_spread', 'short_spread', 'exit', 'neutral']).toContain(result.signal);
    });

    it('应计算历史分位', () => {
      const pair = makePair();
      const ci = testCointegration(pair);
      const result = analyzeSpread(pair, ci);
      expect(result.percentile).toBeGreaterThanOrEqual(0);
      expect(result.percentile).toBeLessThanOrEqual(100);
    });

    it('应估算持有期', () => {
      const pair = makePair();
      const ci = testCointegration(pair);
      const result = analyzeSpread(pair, ci);
      expect(result.holdingPeriod).toBeGreaterThan(0);
    });
  });

  describe('generatePairSignal', () => {
    it('应生成交易信号', () => {
      const result = generatePairSignal(makePair());
      expect(['open_long_A_short_B', 'open_short_A_long_B', 'close', 'hold']).toContain(result.action);
    });

    it('应计算风险收益比', () => {
      const result = generatePairSignal(makePair());
      expect(result.riskReward).toBeGreaterThanOrEqual(0);
    });

    it('应计算最大仓位', () => {
      const result = generatePairSignal(makePair());
      expect(result.maxPosition).toBeGreaterThanOrEqual(0);
      expect(result.maxPosition).toBeLessThanOrEqual(20);
    });
  });
});
