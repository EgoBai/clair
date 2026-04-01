import { describe, it, expect } from 'vitest';
import { EarningsRevisionEngine } from '../utils/earningsRevisionTrackerEngine';
import type { EarningsRevision, RevisionMomentum } from '../utils/earningsRevisionTrackerEngine';

describe('盈利预期修正引擎', () => {
  const engine = new EarningsRevisionEngine();

  const createRevision = (overrides: Partial<EarningsRevision> = {}): EarningsRevision => ({
    stockCode: '000001',
    stockName: '平安银行',
    period: 'FY1',
    metric: 'EPS',
    currentValue: 2.5,
    previousValue: 2.3,
    revisionDate: '2024-01-15',
    analystCount: 10,
    consensusType: 'mean',
    ...overrides
  });

  describe('calculateMomentum', () => {
    it('空数组返回中性', () => {
      const result = engine.calculateMomentum([]);
      expect(result.momentum).toBe('neutral');
      expect(result.upsCount).toBe(0);
    });

    it('全部上调返回强正面', () => {
      const revisions = Array.from({ length: 10 }, () => 
        createRevision({ currentValue: 3.0, previousValue: 2.0 })
      );
      const result = engine.calculateMomentum(revisions);
      expect(result.momentum).toBe('strong_positive');
      expect(result.upsCount).toBe(10);
      expect(result.downsCount).toBe(0);
    });

    it('全部下调返回强负面', () => {
      const revisions = Array.from({ length: 10 }, () => 
        createRevision({ currentValue: 1.5, previousValue: 2.5 })
      );
      const result = engine.calculateMomentum(revisions);
      expect(result.momentum).toBe('strong_negative');
      expect(result.downsCount).toBe(10);
    });

    it('混合修正正确计算比率', () => {
      const up = Array.from({ length: 6 }, () => 
        createRevision({ currentValue: 3.0, previousValue: 2.0 })
      );
      const down = Array.from({ length: 4 }, () => 
        createRevision({ currentValue: 1.5, previousValue: 2.5 })
      );
      const result = engine.calculateMomentum([...up, ...down]);
      expect(result.upsCount).toBe(6);
      expect(result.downsCount).toBe(4);
      expect(result.netRevision).toBe(2);
      expect(result.revisionRatio).toBeCloseTo(0.6);
    });

    it('revisionRatio在0到1之间', () => {
      const revisions = [createRevision(), createRevision({ currentValue: 2.1, previousValue: 2.5 })];
      const result = engine.calculateMomentum(revisions);
      expect(result.revisionRatio).toBeGreaterThanOrEqual(0);
      expect(result.revisionRatio).toBeLessThanOrEqual(1);
    });

    it('avgRevisionPct正确计算', () => {
      const revisions = [
        createRevision({ currentValue: 3.0, previousValue: 2.0 }), // +50%
        createRevision({ currentValue: 2.0, previousValue: 2.0 }), // 0%
      ];
      const result = engine.calculateMomentum(revisions);
      expect(result.avgRevisionPct).toBeCloseTo(25);
    });

    it('previousValue为0时不报错', () => {
      const revisions = [createRevision({ currentValue: 1.0, previousValue: 0 })];
      const result = engine.calculateMomentum(revisions);
      expect(result.avgRevisionPct).toBe(0);
    });
  });

  describe('analyzeTrend', () => {
    it('空数据返回稳定趋势', () => {
      const result = engine.analyzeTrend(new Map());
      expect(result.trend).toBe('stable');
      expect(result.turningPoint).toBeNull();
    });

    it('持续上升趋势识别', () => {
      const data = new Map([
        ['2024-01', [createRevision({ currentValue: 2.1, previousValue: 2.0 })]],
        ['2024-02', [createRevision({ currentValue: 2.3, previousValue: 2.1 })]],
        ['2024-03', [createRevision({ currentValue: 2.6, previousValue: 2.3 })]],
        ['2024-04', [createRevision({ currentValue: 3.0, previousValue: 2.6 })]],
      ]);
      const result = engine.analyzeTrend(data);
      expect(result.epsRevisions.length).toBe(4);
      expect(result.dates.length).toBe(4);
    });

    it('识别拐点', () => {
      const data = new Map([
        ['2024-01', [createRevision({ currentValue: 2.0, previousValue: 2.5 })]], // 下调
        ['2024-02', [createRevision({ currentValue: 2.8, previousValue: 2.0 })]], // 上调
        ['2024-03', [createRevision({ currentValue: 3.0, previousValue: 2.8 })]], // 上调
      ]);
      const result = engine.analyzeTrend(data);
      expect(result.turningPoint).toBe('2024-02');
    });

    it('包含收入修正数据', () => {
      const data = new Map([
        ['2024-01', [
          createRevision({ metric: 'EPS', currentValue: 2.5, previousValue: 2.3 }),
          createRevision({ metric: 'Revenue', currentValue: 100, previousValue: 90 }),
        ]],
      ]);
      const result = engine.analyzeTrend(data);
      expect(result.epsRevisions.length).toBe(1);
      expect(result.revenueRevisions.length).toBe(1);
    });
  });

  describe('industryRevisionBreadth', () => {
    it('计算行业修正广度', () => {
      const revisions = new Map<string, RevisionMomentum>([
        ['bank1', { stockCode: '银行', period: '', upsCount: 5, downsCount: 1, netRevision: 4, revisionRatio: 0.83, momentum: 'strong_positive', avgRevisionPct: 10, breadth: 0.83 }],
        ['bank2', { stockCode: '银行', period: '', upsCount: 3, downsCount: 2, netRevision: 1, revisionRatio: 0.6, momentum: 'positive', avgRevisionPct: 3, breadth: 0.6 }],
      ]);
      const result = engine.industryRevisionBreadth(revisions);
      expect(result.length).toBeGreaterThan(0);
    });

    it('空数据返回空数组', () => {
      const result = engine.industryRevisionBreadth(new Map());
      expect(result).toEqual([]);
    });
  });

  describe('estimateSurpriseProbability', () => {
    it('概率和为1', () => {
      const result = engine.estimateSurpriseProbability(
        [createRevision()],
        { beat: 50, miss: 20, meet: 30 }
      );
      const total = result.beatProb + result.missProb + result.meetProb;
      expect(total).toBeCloseTo(1, 1);
    });

    it('历史数据更多时置信度更高', () => {
      const low = engine.estimateSurpriseProbability([createRevision()], { beat: 5, miss: 2, meet: 3 });
      const high = engine.estimateSurpriseProbability(
        Array.from({ length: 20 }, () => createRevision()),
        { beat: 50, miss: 20, meet: 30 }
      );
      expect(high.confidence).toBeGreaterThan(low.confidence);
    });

    it('空修正历史不报错', () => {
      const result = engine.estimateSurpriseProbability([], { beat: 0, miss: 0, meet: 0 });
      expect(result.beatProb).toBeDefined();
    });
  });
});
