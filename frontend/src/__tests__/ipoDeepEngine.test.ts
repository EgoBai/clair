import { describe, it, expect } from 'vitest';
import { IPOAnalysisEngine } from '../utils/ipoDeepEngine';
import type { IPORecord } from '../utils/ipoDeepEngine';

describe('IPO深度分析引擎', () => {
  const engine = new IPOAnalysisEngine();

  const createIPO = (overrides: Partial<IPORecord> = {}): IPORecord => ({
    stockCode: '301001',
    stockName: '测试新股',
    ipoDate: '2024-01-15',
    issuePrice: 10,
    firstDayOpen: 20,
    firstDayClose: 25,
    firstDayHigh: 30,
    firstDayLow: 18,
    peRatio: 20,
    industryPE: 30,
    totalRaise: 5,
    oversubscriptionRate: 300,
    industry: '科技',
    lockUpShares: 5000,
    ...overrides
  });

  describe('analyzeIPO', () => {
    it('计算首日涨幅', () => {
      const result = engine.analyzeIPO(createIPO());
      expect(result.firstDayReturn).toBeCloseTo(150); // (25-10)/10*100
    });

    it('首日振幅计算', () => {
      const result = engine.analyzeIPO(createIPO());
      expect(result.firstDayAmplitude).toBeGreaterThan(0);
    });

    it('市盈率折价', () => {
      const result = engine.analyzeIPO(createIPO({ peRatio: 15, industryPE: 30 }));
      expect(result.peDiscount).toBeCloseTo(50);
    });

    it('热度分类', () => {
      const hot = engine.analyzeIPO(createIPO({ oversubscriptionRate: 600, firstDayClose: 30 }));
      expect(hot.hotDegree).toBe('hot');

      const cold = engine.analyzeIPO(createIPO({ oversubscriptionRate: 30, firstDayClose: 11 }));
      expect(cold.hotDegree).toBe('cold');
    });

    it('包含解禁日期', () => {
      const result = engine.analyzeIPO(createIPO());
      expect(result.lockUpDate).toBeDefined();
      expect(result.lockUpDate).toContain('2025');
    });

    it('解禁影响评分在0-100之间', () => {
      const result = engine.analyzeIPO(createIPO());
      expect(result.lockUpImpact).toBeGreaterThanOrEqual(0);
      expect(result.lockUpImpact).toBeLessThanOrEqual(100);
    });

    it('发行价为0时不报错', () => {
      const result = engine.analyzeIPO(createIPO({ issuePrice: 0 }));
      expect(result.firstDayReturn).toBe(0);
    });
  });

  describe('calculateMarketSentiment', () => {
    it('返回每日情绪', () => {
      const ipos = [createIPO({ ipoDate: '2024-01-15' })];
      const result = engine.calculateMarketSentiment(ipos);
      expect(result.length).toBe(1);
      expect(result[0].ipoCount).toBe(1);
    });

    it('破发率计算', () => {
      const ipos = [
        createIPO({ ipoDate: '2024-01-15', issuePrice: 10, firstDayClose: 8 }),
        createIPO({ ipoDate: '2024-01-15', issuePrice: 10, firstDayClose: 15 }),
      ];
      const result = engine.calculateMarketSentiment(ipos);
      expect(result[0].breakRate).toBeCloseTo(50);
    });

    it('情绪分类', () => {
      const hot = engine.calculateMarketSentiment([
        createIPO({ ipoDate: '2024-01-15', issuePrice: 10, firstDayClose: 25 }),
      ]);
      expect(['frenzy', 'active', 'normal']).toContain(hot[0].marketSentiment);

      const cold = engine.calculateMarketSentiment([
        createIPO({ ipoDate: '2024-01-15', issuePrice: 10, firstDayClose: 8 }),
        createIPO({ ipoDate: '2024-01-15', issuePrice: 10, firstDayClose: 7 }),
      ]);
      expect(['cold', 'frozen']).toContain(cold[0].marketSentiment);
    });

    it('按日期排序', () => {
      const ipos = [
        createIPO({ ipoDate: '2024-01-16' }),
        createIPO({ ipoDate: '2024-01-15' }),
      ];
      const result = engine.calculateMarketSentiment(ipos);
      expect(result[0].date).toBe('2024-01-15');
    });

    it('总募资额汇总', () => {
      const ipos = [
        createIPO({ ipoDate: '2024-01-15', totalRaise: 5 }),
        createIPO({ ipoDate: '2024-01-15', totalRaise: 3 }),
      ];
      const result = engine.calculateMarketSentiment(ipos);
      expect(result[0].totalRaised).toBe(8);
    });
  });

  describe('backtestNewStockStrategy', () => {
    it('全部打新策略', () => {
      const ipos = Array.from({ length: 10 }, () => createIPO());
      const result = engine.backtestNewStockStrategy(ipos, 'all');
      expect(result.strategy).toBe('全部打新');
      expect(result.sampleSize).toBe(10);
    });

    it('低市盈率策略筛选', () => {
      const ipos = [
        createIPO({ peRatio: 10, industryPE: 30 }),
        createIPO({ peRatio: 50, industryPE: 30 }),
      ];
      const result = engine.backtestNewStockStrategy(ipos, 'low_pe');
      expect(result.sampleSize).toBe(1);
    });

    it('winRate在0-100之间', () => {
      const ipos = Array.from({ length: 5 }, () => createIPO());
      const result = engine.backtestNewStockStrategy(ipos, 'all');
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });

    it('空数据返回零值', () => {
      const result = engine.backtestNewStockStrategy([], 'all');
      expect(result.avgReturn).toBe(0);
      expect(result.sampleSize).toBe(0);
    });

    it('高认购倍数策略', () => {
      const ipos = [
        createIPO({ oversubscriptionRate: 500 }),
        createIPO({ oversubscriptionRate: 50 }),
      ];
      const result = engine.backtestNewStockStrategy(ipos, 'high_oversubscription');
      expect(result.sampleSize).toBe(1);
    });
  });

  describe('predictLockUpImpact', () => {
    it('计算解禁影响', () => {
      const result = engine.predictLockUpImpact(createIPO(), 25, 10000, 5000);
      expect(result.daysToAbsorb).toBeGreaterThan(0);
      expect(result.priceImpact).toBeGreaterThan(0);
    });

    it('风险分级', () => {
      const low = engine.predictLockUpImpact(createIPO(), 25, 100, 100000);
      expect(['low', 'medium', 'high']).toContain(low.riskLevel);
    });

    it('大解禁量→高风险', () => {
      const result = engine.predictLockUpImpact(createIPO(), 25, 1000000, 1000);
      expect(result.riskLevel).toBe('high');
    });

    it('包含建议', () => {
      const result = engine.predictLockUpImpact(createIPO(), 25, 5000, 10000);
      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('成交量为0时不报错', () => {
      const result = engine.predictLockUpImpact(createIPO(), 25, 10000, 0);
      expect(result.daysToAbsorb).toBe(999);
    });
  });
});
