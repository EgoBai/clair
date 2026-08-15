import { describe, it, expect } from 'vitest';
import {
  ResearchReportEngine,
  type ResearchReport
} from '../utils/researchReportAnalysisEngine';

/**
 * 研究报告分析引擎测试（导入真实模块）
 */

describe('ResearchReportEngine', () => {
  const engine = new ResearchReportEngine();

  const makeReport = (
    rating: ResearchReport['rating'],
    opts: Partial<ResearchReport> = {}
  ): ResearchReport => ({
    stockCode: '600519',
    stockName: '茅台',
    brokerName: 'CICC',
    analystName: '张三',
    rating,
    previousRating: 'hold',
    targetPrice: 100,
    currentPrice: 80,
    publishDate: '2024-01-01',
    industry: '白酒',
    ...opts
  });

  describe('calculateConsensus', () => {
    it('should compute a strong_buy consensus for all-buy reports', () => {
      const reports = [makeReport('buy'), makeReport('buy'), makeReport('buy')];
      const c = engine.calculateConsensus(reports);
      expect(c.stockCode).toBe('600519');
      expect(c.consensusRating).toBe('strong_buy');
      expect(c.buyCount).toBe(3);
      expect(c.holdCount).toBe(0);
      expect(c.sellCount).toBe(0);
      expect(c.coverageDepth).toBe(3);
    });

    it('should calculate upside potential from target vs current price', () => {
      const c = engine.calculateConsensus([makeReport('buy', { targetPrice: 100, currentPrice: 80 })]);
      expect(c.avgTargetPrice).toBeCloseTo(100, 5);
      expect(c.upsidePotential).toBeCloseTo(25, 5);
    });

    it('should handle empty reports with zeroed consensus', () => {
      const c = engine.calculateConsensus([]);
      expect(c.avgTargetPrice).toBe(0);
      expect(c.medianTargetPrice).toBe(0);
      expect(c.upsidePotential).toBe(0);
      expect(c.consensusRating).toBe('hold');
      expect(c.coverageDepth).toBe(0);
      expect(c.ratingChanges).toEqual({ upgrades: 0, downgrades: 0 });
    });

    it('should count rating distribution across buy/hold/sell', () => {
      const reports = [makeReport('buy'), makeReport('overweight'), makeReport('sell')];
      const c = engine.calculateConsensus(reports);
      expect(c.buyCount).toBe(2); // buy + overweight
      expect(c.holdCount).toBe(0);
      expect(c.sellCount).toBe(1);
    });

    it('should compute median target price and dispersion', () => {
      const reports = [
        makeReport('buy', { targetPrice: 100 }),
        makeReport('buy', { targetPrice: 100 }),
        makeReport('buy', { targetPrice: 100 })
      ];
      const c = engine.calculateConsensus(reports);
      expect(c.medianTargetPrice).toBe(100);
      expect(c.priceDispersion).toBe(0); // no variance when all equal
    });

    it('should measure dispersion for spread targets', () => {
      const reports = [
        makeReport('buy', { targetPrice: 90 }),
        makeReport('buy', { targetPrice: 100 }),
        makeReport('buy', { targetPrice: 110 })
      ];
      const c = engine.calculateConsensus(reports);
      expect(c.medianTargetPrice).toBe(100);
      expect(c.priceDispersion).toBeCloseTo(8.16497, 4);
    });

    it('should count upgrades and downgrades from previousRating', () => {
      const reports = [
        makeReport('buy', { previousRating: 'hold' }),     // upgrade
        makeReport('sell', { previousRating: 'hold' }),    // downgrade
        makeReport('hold', { previousRating: 'hold' })      // unchanged
      ];
      const c = engine.calculateConsensus(reports);
      expect(c.ratingChanges).toEqual({ upgrades: 1, downgrades: 1 });
    });
  });

  describe('evaluateAnalystAccuracy', () => {
    it('should return neutral/50 score for empty reports', () => {
      const a = engine.evaluateAnalystAccuracy('张三', 'CICC', []);
      expect(a.totalReports).toBe(0);
      expect(a.score).toBe(50);
      expect(a.bias).toBe('neutral');
    });

    it('should compute hit rate and optimistic bias for overshooting targets', () => {
      const a = engine.evaluateAnalystAccuracy('张三', 'CICC', [
        { targetPrice: 115, actualPrice: 100, publishDate: '2024-01-01' },
        { targetPrice: 120, actualPrice: 100, publishDate: '2024-01-02' }
      ]);
      expect(a.totalReports).toBe(2);
      expect(a.hitRate).toBe(0); // both overshoot >10%
      expect(a.avgError).toBeCloseTo(17.5, 5);
      expect(a.bias).toBe('optimistic');
      expect(a.score).toBeCloseTo(41.25, 4);
    });

    it('should detect pessimistic bias when targets fall short', () => {
      const a = engine.evaluateAnalystAccuracy('李四', 'HTSC', [
        { targetPrice: 80, actualPrice: 100, publishDate: '2024-01-01' }
      ]);
      expect(a.avgError).toBeCloseTo(-20, 5);
      expect(a.bias).toBe('pessimistic');
    });
  });

  describe('calculateSentimentIndex', () => {
    it('should aggregate sentiment by publish date', () => {
      const reports = [
        makeReport('buy', { publishDate: '2024-01-01' }),
        makeReport('buy', { publishDate: '2024-01-01' }),
        makeReport('sell', { publishDate: '2024-01-02' })
      ];
      const idx = engine.calculateSentimentIndex(reports);
      expect(idx).toHaveLength(2);
      expect(idx[0].date).toBe('2024-01-01');
      expect(idx[0].sentimentScore).toBe(100); // two buys
      expect(idx[0].signal).toBe('bullish');
      expect(idx[0].breadth).toBe(1);
      expect(idx[1].sentimentScore).toBe(-100);
      expect(idx[1].signal).toBe('bearish');
    });
  });

  describe('analyzeRatingChanges', () => {
    it('should report per-stock rating changes and net impact', () => {
      const reports = [
        makeReport('buy', { previousRating: 'hold', publishDate: '2024-01-01' }),
        makeReport('sell', { previousRating: 'hold', brokerName: 'CICC' })
      ];
      const result = engine.analyzeRatingChanges(reports);
      expect(result).toHaveLength(1);
      const stock = result[0];
      expect(stock.stockCode).toBe('600519');
      expect(stock.changes).toHaveLength(2);
      expect(stock.changes[0]).toMatchObject({ broker: 'CICC', from: 'hold', to: 'buy', impact: 'positive' });
      expect(stock.changes[1].impact).toBe('negative');
      expect(stock.netImpact).toBe(0); // +1 -1
    });

    it('should skip reports without a previous rating', () => {
      const reports = [makeReport('buy', { previousRating: '' })];
      const result = engine.analyzeRatingChanges(reports);
      expect(result[0].changes).toHaveLength(0);
    });
  });
});
