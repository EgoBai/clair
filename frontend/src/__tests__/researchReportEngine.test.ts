import { describe, it, expect } from 'vitest';
import {
  ratingToNumber,
  trackRatingChanges,
  analyzeConsensus,
  analyzeReportSentiment,
  findMostDivided,
  type ResearchReport,
} from '../utils/researchReportEngine';

function makeReport(overrides: Partial<ResearchReport> = {}): ResearchReport {
  return {
    id: 'R001',
    ticker: '600519',
    broker: '中信证券',
    analyst: '张三',
    date: '2026-03-15',
    type: 'update',
    rating: 'buy',
    targetPrice: 2000,
    currentPrice: 1800,
    title: '业绩超预期，维持买入',
    summary: '公司业绩超预期增长，看好未来',
    keyPoints: ['收入增长20%', '利润增长25%', '提价预期'],
    ...overrides,
  };
}

describe('Research Report Engine', () => {
  describe('ratingToNumber', () => {
    it('should map ratings to numbers', () => {
      expect(ratingToNumber('buy')).toBe(5);
      expect(ratingToNumber('overweight')).toBe(4);
      expect(ratingToNumber('hold')).toBe(3);
      expect(ratingToNumber('underweight')).toBe(2);
      expect(ratingToNumber('sell')).toBe(1);
      expect(ratingToNumber('none')).toBe(0);
    });
  });

  describe('trackRatingChanges', () => {
    it('should detect upgrades', () => {
      const reports = [
        makeReport({ date: '2026-01-01', rating: 'hold', prevRating: undefined }),
        makeReport({ date: '2026-03-01', rating: 'buy', prevRating: 'hold' }),
      ];
      const changes = trackRatingChanges(reports);
      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0].direction).toBe('upgrade');
      expect(changes[0].from).toBe('hold');
      expect(changes[0].to).toBe('buy');
    });

    it('should detect downgrades', () => {
      const reports = [
        makeReport({ date: '2026-01-01', rating: 'buy' }),
        makeReport({
          date: '2026-03-01', rating: 'hold', prevRating: 'buy',
          broker: '中信证券',
        }),
      ];
      const changes = trackRatingChanges(reports);
      expect(changes[0].direction).toBe('downgrade');
    });

    it('should calculate upside', () => {
      const reports = [
        makeReport({ date: '2026-01-01', rating: 'hold' }),
        makeReport({
          date: '2026-03-01', rating: 'buy', prevRating: 'hold',
          currentPrice: 1000, targetPrice: 1200,
        }),
      ];
      const changes = trackRatingChanges(reports);
      expect(changes[0].upside).toBeCloseTo(0.2, 2);
    });

    it('should return empty for no changes', () => {
      const reports = [makeReport()];
      expect(trackRatingChanges(reports)).toEqual([]);
    });
  });

  describe('analyzeConsensus', () => {
    it('should return null for empty reports', () => {
      expect(analyzeConsensus([])).toBeNull();
    });

    it('should calculate buy ratio', () => {
      const reports = [
        makeReport({ rating: 'buy', broker: 'A' }),
        makeReport({ rating: 'buy', broker: 'B' }),
        makeReport({ rating: 'hold', broker: 'C' }),
        makeReport({ rating: 'sell', broker: 'D' }),
      ];
      const consensus = analyzeConsensus(reports);
      expect(consensus!.buyCount).toBe(2);
      expect(consensus!.holdCount).toBe(1);
      expect(consensus!.sellCount).toBe(1);
      expect(consensus!.buyRatio).toBe(0.5);
    });

    it('should calculate target price stats', () => {
      const reports = [
        makeReport({ targetPrice: 2000, broker: 'A' }),
        makeReport({ targetPrice: 2100, broker: 'B' }),
        makeReport({ targetPrice: 1900, broker: 'C' }),
      ];
      const consensus = analyzeConsensus(reports);
      expect(consensus!.avgTargetPrice).toBeCloseTo(2000, 0);
      expect(consensus!.priceRange.low).toBe(1900);
      expect(consensus!.priceRange.high).toBe(2100);
    });

    it('should determine consensus strength', () => {
      const reports = Array.from({ length: 5 }, (_, i) =>
        makeReport({ rating: 'buy', broker: `B${i}` })
      );
      const consensus = analyzeConsensus(reports);
      expect(consensus!.consensusStrength).toBe('strong');
    });

    it('should identify top brokers', () => {
      const reports = [
        makeReport({ broker: 'A', targetPrice: 2200 }),
        makeReport({ broker: 'B', targetPrice: 1800 }),
        makeReport({ broker: 'C', targetPrice: 2000 }),
      ];
      const consensus = analyzeConsensus(reports);
      expect(consensus!.topBrokers[0].broker).toBe('A');
    });
  });

  describe('analyzeReportSentiment', () => {
    it('should detect positive sentiment', () => {
      const report = makeReport({
        title: '业绩超预期增长',
        summary: '收入大幅增长，看好未来前景',
        keyPoints: ['增长', '突破', '推荐买入'],
      });
      const sentiment = analyzeReportSentiment(report);
      expect(['positive', 'very_positive']).toContain(sentiment.sentiment);
      expect(sentiment.bullishKeywords.length).toBeGreaterThan(0);
    });

    it('should detect negative sentiment', () => {
      const report = makeReport({
        title: '业绩低于预期',
        summary: '需求疲软，成本上升，风险加大',
        rating: 'sell',
        keyPoints: ['下滑', '高估', '风险'],
      });
      const sentiment = analyzeReportSentiment(report);
      expect(['negative', 'very_negative']).toContain(sentiment.sentiment);
      expect(sentiment.bearishKeywords.length).toBeGreaterThan(0);
    });

    it('should detect neutral sentiment', () => {
      const report = makeReport({
        title: '季度点评',
        summary: '业务平稳',
        rating: 'hold',
        keyPoints: ['稳定'],
      });
      const sentiment = analyzeReportSentiment(report);
      expect(sentiment.sentiment).toBe('neutral');
    });

    it('should factor in rating', () => {
      const positive = analyzeReportSentiment(makeReport({ rating: 'buy' }));
      const negative = analyzeReportSentiment(makeReport({ rating: 'sell' }));
      expect(positive.score).toBeGreaterThan(negative.score);
    });

    it('should calculate confidence based on keyword count', () => {
      const report = makeReport({
        keyPoints: ['增长', '超预期', '突破', '推荐', '看好'],
      });
      const sentiment = analyzeReportSentiment(report);
      expect(sentiment.confidence).toBe(1); // max confidence
    });
  });

  describe('findMostDivided', () => {
    it('should find stocks with mixed opinions', () => {
      const consensuses = [
        {
          ticker: 'A', totalReports: 5, buyCount: 5, holdCount: 0, sellCount: 0,
          buyRatio: 1, avgTargetPrice: 100, medianTargetPrice: 100, currentPrice: 80,
          avgUpside: 0.25, priceRange: { low: 90, high: 110 },
          consensusStrength: 'strong' as const, recentTrend: 'stable' as const,
          topBrokers: [],
        },
        {
          ticker: 'B', totalReports: 5, buyCount: 3, holdCount: 0, sellCount: 2,
          buyRatio: 0.6, avgTargetPrice: 100, medianTargetPrice: 100, currentPrice: 80,
          avgUpside: 0.25, priceRange: { low: 60, high: 140 },
          consensusStrength: 'divided' as const, recentTrend: 'stable' as const,
          topBrokers: [],
        },
      ];
      const divided = findMostDivided(consensuses);
      expect(divided.length).toBe(1);
      expect(divided[0].ticker).toBe('B');
    });
  });
});
