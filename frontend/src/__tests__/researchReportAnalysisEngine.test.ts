import { describe, it, expect } from 'vitest';
import { ResearchReportEngine } from '../utils/researchReportAnalysisEngine';
import type { ResearchReport } from '../utils/researchReportAnalysisEngine';

describe('券商研报分析引擎', () => {
  const engine = new ResearchReportEngine();

  const createReport = (overrides: Partial<ResearchReport> = {}): ResearchReport => ({
    stockCode: '000001',
    stockName: '平安银行',
    brokerName: '中信证券',
    analystName: '张三',
    rating: 'buy',
    previousRating: 'hold',
    targetPrice: 15,
    currentPrice: 12,
    publishDate: '2024-01-15',
    industry: '银行',
    ...overrides
  });

  describe('calculateConsensus', () => {
    it('空数据返回默认值', () => {
      const result = engine.calculateConsensus([]);
      expect(result.consensusRating).toBe('hold');
      expect(result.coverageDepth).toBe(0);
    });

    it('计算平均目标价', () => {
      const reports = [
        createReport({ targetPrice: 14 }),
        createReport({ targetPrice: 16 }),
        createReport({ targetPrice: 15 }),
      ];
      const result = engine.calculateConsensus(reports);
      expect(result.avgTargetPrice).toBeCloseTo(15);
    });

    it('计算上涨空间', () => {
      const reports = [createReport({ targetPrice: 15, currentPrice: 10 })];
      const result = engine.calculateConsensus(reports);
      expect(result.upsidePotential).toBeCloseTo(50);
    });

    it('买入/持有/卖出计数', () => {
      const reports = [
        createReport({ rating: 'buy' }),
        createReport({ rating: 'buy' }),
        createReport({ rating: 'hold' }),
        createReport({ rating: 'sell' }),
      ];
      const result = engine.calculateConsensus(reports);
      expect(result.buyCount).toBe(2);
      expect(result.holdCount).toBe(1);
      expect(result.sellCount).toBe(1);
    });

    it('一致评级判断', () => {
      const allBuy = [createReport({ rating: 'buy' }), createReport({ rating: 'overweight' })];
      const result = engine.calculateConsensus(allBuy);
      expect(['strong_buy', 'buy']).toContain(result.consensusRating);
    });

    it('覆盖深度', () => {
      const reports = Array.from({ length: 5 }, () => createReport());
      expect(engine.calculateConsensus(reports).coverageDepth).toBe(5);
    });

    it('评级变动统计', () => {
      const reports = [
        createReport({ rating: 'buy', previousRating: 'hold' }),
        createReport({ rating: 'hold', previousRating: 'buy' }),
      ];
      const result = engine.calculateConsensus(reports);
      expect(result.ratingChanges.upgrades).toBe(1);
      expect(result.ratingChanges.downgrades).toBe(1);
    });

    it('目标价离散度计算', () => {
      const reports = [
        createReport({ targetPrice: 10 }),
        createReport({ targetPrice: 20 }),
      ];
      const result = engine.calculateConsensus(reports);
      expect(result.priceDispersion).toBeGreaterThan(0);
    });
  });

  describe('evaluateAnalystAccuracy', () => {
    it('空报告返回中性', () => {
      const result = engine.evaluateAnalystAccuracy('张三', '中信', []);
      expect(result.bias).toBe('neutral');
      expect(result.score).toBe(50);
    });

    it('计算平均偏差', () => {
      const reports = [
        { targetPrice: 15, actualPrice: 12, publishDate: '2024-01-01' },
        { targetPrice: 14, actualPrice: 13, publishDate: '2024-02-01' },
      ];
      const result = engine.evaluateAnalystAccuracy('张三', '中信', reports);
      expect(result.avgError).toBeGreaterThan(0); // 目标价高于实际
    });

    it('准确率计算', () => {
      const reports = [
        { targetPrice: 10, actualPrice: 10.5, publishDate: '2024-01-01' }, // 误差5%
        { targetPrice: 10, actualPrice: 20, publishDate: '2024-02-01' }, // 误差100%
      ];
      const result = engine.evaluateAnalystAccuracy('张三', '中信', reports);
      expect(result.hitRate).toBe(50); // 1/2
    });

    it('偏见分类', () => {
      const optimistic = engine.evaluateAnalystAccuracy('乐观', 'A', [
        { targetPrice: 20, actualPrice: 10, publishDate: '2024-01-01' }
      ]);
      expect(optimistic.bias).toBe('optimistic');

      const pessimistic = engine.evaluateAnalystAccuracy('悲观', 'B', [
        { targetPrice: 5, actualPrice: 15, publishDate: '2024-01-01' }
      ]);
      expect(pessimistic.bias).toBe('pessimistic');
    });

    it('评分在0-100之间', () => {
      const result = engine.evaluateAnalystAccuracy('张三', '中信', [
        { targetPrice: 12, actualPrice: 11, publishDate: '2024-01-01' }
      ]);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateSentimentIndex', () => {
    it('返回每日情绪', () => {
      const reports = [
        createReport({ publishDate: '2024-01-15', rating: 'buy' }),
        createReport({ publishDate: '2024-01-15', rating: 'hold' }),
      ];
      const result = engine.calculateSentimentIndex(reports);
      expect(result.length).toBe(1);
      expect(result[0].signal).toBeDefined();
    });

    it('情绪评分在-100到100之间', () => {
      const reports = [createReport({ rating: 'buy' })];
      const result = engine.calculateSentimentIndex(reports);
      expect(result[0].sentimentScore).toBeGreaterThanOrEqual(-100);
      expect(result[0].sentimentScore).toBeLessThanOrEqual(100);
    });

    it('全部买入→看涨', () => {
      const reports = [createReport({ rating: 'buy' }), createReport({ rating: 'overweight' })];
      const result = engine.calculateSentimentIndex(reports);
      expect(result[0].signal).toBe('bullish');
    });

    it('全部卖出→看跌', () => {
      const reports = [createReport({ rating: 'sell' })];
      const result = engine.calculateSentimentIndex(reports);
      expect(result[0].signal).toBe('bearish');
    });
  });

  describe('analyzeRatingChanges', () => {
    it('识别评级变动', () => {
      const reports = [
        createReport({ brokerName: '中信', rating: 'buy', previousRating: 'hold' }),
      ];
      const result = engine.analyzeRatingChanges(reports);
      expect(result[0].changes.length).toBe(1);
      expect(result[0].changes[0].impact).toBe('positive');
    });

    it('降级标记为负面', () => {
      const reports = [
        createReport({ rating: 'hold', previousRating: 'buy' }),
      ];
      const result = engine.analyzeRatingChanges(reports);
      expect(result[0].changes[0].impact).toBe('negative');
    });

    it('净影响计算', () => {
      const reports = [
        createReport({ rating: 'buy', previousRating: 'hold' }),
        createReport({ rating: 'hold', previousRating: 'buy' }),
      ];
      const result = engine.analyzeRatingChanges(reports);
      expect(result[0].netImpact).toBe(0);
    });

    it('无变动不产生事件', () => {
      const reports = [createReport({ rating: 'buy', previousRating: 'buy' })];
      const result = engine.analyzeRatingChanges(reports);
      expect(result[0].changes.length).toBe(0);
    });
  });
});
