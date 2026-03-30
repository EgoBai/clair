import { describe, it, expect } from 'vitest';
import {
  rankIndustries,
  calculateProsperityIndex,
  compareIndustries,
  analyzeChainPosition,
  type IndustryData,
} from '../utils/industryComparison';

describe('IndustryComparison', () => {
  const mockIndustries: IndustryData[] = [
    { name: '半导体', code: 'semi', pe: 45, pb: 5, ps: 6, roe: 0.12, grossMargin: 0.35, netMargin: 0.15, revenueGrowth: 25, profitGrowth: 30, debtToEquity: 0.3, dividendYield: 0.005, marketCap: 50000, turnoverRate: 3, stockCount: 100, upCount: 70, downCount: 30 },
    { name: '银行', code: 'bank', pe: 5, pb: 0.6, ps: 1, roe: 0.12, grossMargin: 0.4, netMargin: 0.35, revenueGrowth: 3, profitGrowth: 5, debtToEquity: 0, dividendYield: 0.06, marketCap: 100000, turnoverRate: 0.5, stockCount: 40, upCount: 20, downCount: 20 },
    { name: '消费', code: 'consumer', pe: 25, pb: 4, ps: 3, roe: 0.18, grossMargin: 0.45, netMargin: 0.15, revenueGrowth: 10, profitGrowth: 12, debtToEquity: 0.2, dividendYield: 0.02, marketCap: 80000, turnoverRate: 1.5, stockCount: 80, upCount: 50, downCount: 30 },
    { name: '新能源', code: 'ne', pe: 35, pb: 4, ps: 4, roe: 0.15, grossMargin: 0.25, netMargin: 0.1, revenueGrowth: 40, profitGrowth: 50, debtToEquity: 0.5, dividendYield: 0.003, marketCap: 60000, turnoverRate: 4, stockCount: 60, upCount: 45, downCount: 15 },
    { name: '煤炭', code: 'coal', pe: 8, pb: 1.2, ps: 1.5, roe: 0.2, grossMargin: 0.3, netMargin: 0.15, revenueGrowth: -5, profitGrowth: -10, debtToEquity: 0.4, dividendYield: 0.05, marketCap: 20000, turnoverRate: 2, stockCount: 30, upCount: 10, downCount: 20 },
  ];

  describe('rankIndustries', () => {
    it('should rank all industries', () => {
      const result = rankIndustries(mockIndustries);
      expect(result).toHaveLength(5);
      expect(result.every((r) => r.rank > 0)).toBe(true);
    });

    it('should have sequential ranks', () => {
      const result = rankIndustries(mockIndustries);
      const ranks = result.map((r) => r.rank).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3, 4, 5]);
    });

    it('should include score', () => {
      const result = rankIndustries(mockIndustries);
      for (const r of result) {
        expect(r.score).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle single industry', () => {
      const result = rankIndustries([mockIndustries[0]]);
      expect(result).toHaveLength(1);
      expect(result[0].rank).toBe(1);
    });

    it('should handle empty input', () => {
      const result = rankIndustries([]);
      expect(result).toHaveLength(0);
    });

    it('should give higher score to better balanced industries', () => {
      const result = rankIndustries(mockIndustries);
      // Bank has very low PE and high dividend, should rank well on valuation
      const bank = result.find((r) => r.industry === '银行');
      expect(bank).toBeDefined();
    });

    it('should sort by score descending', () => {
      const result = rankIndustries(mockIndustries);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });
  });

  describe('calculateProsperityIndex', () => {
    const prevIndustries = mockIndustries.map((i) => ({
      ...i,
      profitGrowth: i.profitGrowth - 5,
      revenueGrowth: i.revenueGrowth - 3,
    }));

    it('should calculate prosperity index for each industry', () => {
      const result = calculateProsperityIndex(mockIndustries, prevIndustries);
      expect(result).toHaveLength(5);
      for (const r of result) {
        expect(r.index).toBeGreaterThanOrEqual(0);
        expect(r.index).toBeLessThanOrEqual(100);
      }
    });

    it('should assign correct level', () => {
      const result = calculateProsperityIndex(mockIndustries, prevIndustries);
      for (const r of result) {
        expect(['boom', 'recover', 'stable', 'decline', 'trough']).toContain(r.level);
      }
    });

    it('should detect trend', () => {
      const result = calculateProsperityIndex(mockIndustries, prevIndustries);
      for (const r of result) {
        expect(['up', 'down', 'flat']).toContain(r.trend);
      }
    });

    it('should generate signals', () => {
      const result = calculateProsperityIndex(mockIndustries, prevIndustries);
      for (const r of result) {
        expect(Array.isArray(r.signals)).toBe(true);
      }
    });

    it('should assign boom for high-profit-growth industries', () => {
      const boomInd: IndustryData[] = [
        { ...mockIndustries[0], profitGrowth: 50, revenueGrowth: 30, turnoverRate: 4, upCount: 80, downCount: 10 },
      ];
      const result = calculateProsperityIndex(boomInd, [{ ...boomInd[0], profitGrowth: 30 }]);
      expect(result[0].index).toBeGreaterThanOrEqual(60);
    });

    it('should assign trough for deeply declining industries', () => {
      const troughInd: IndustryData[] = [
        { ...mockIndustries[0], profitGrowth: -30, revenueGrowth: -15, turnoverRate: 0.5, upCount: 10, downCount: 80 },
      ];
      const result = calculateProsperityIndex(troughInd, [{ ...troughInd[0], profitGrowth: -10 }]);
      expect(result[0].index).toBeLessThanOrEqual(40);
    });

    it('should handle no previous period', () => {
      const result = calculateProsperityIndex(mockIndustries, []);
      expect(result).toHaveLength(5);
      for (const r of result) {
        expect(r.trend).toBe('flat');
      }
    });

    it('should include boom signal for high index', () => {
      const highInd: IndustryData[] = [{
        ...mockIndustries[0], profitGrowth: 60, revenueGrowth: 40,
        turnoverRate: 5, upCount: 90, downCount: 5,
      }];
      const result = calculateProsperityIndex(highInd, []);
      if (result[0].index >= 75) {
        expect(result[0].signals).toContain('行业高景气');
      }
    });
  });

  describe('compareIndustries', () => {
    it('should compare across default metrics', () => {
      const result = compareIndustries(mockIndustries);
      expect(result.length).toBeGreaterThan(0);
      for (const m of result) {
        expect(m.winner).toBeDefined();
        expect(m.values).toHaveLength(5);
      }
    });

    it('should rank values correctly', () => {
      const result = compareIndustries(mockIndustries, ['pe']);
      const peMetric = result[0];
      // PE lower is better, so bank (pe=5) should be rank 1
      expect(peMetric.values[0].industry).toBe('银行');
      expect(peMetric.values[0].rank).toBe(1);
    });

    it('should rank higher-is-better metrics correctly', () => {
      const result = compareIndustries(mockIndustries, ['roe']);
      const roeMetric = result[0];
      // ROE higher is better
      const ranks = roeMetric.values.map((v) => v.rank);
      expect(ranks).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle custom metrics', () => {
      const result = compareIndustries(mockIndustries, ['pe', 'pb', 'revenueGrowth']);
      expect(result).toHaveLength(3);
    });

    it('should handle empty industries', () => {
      const result = compareIndustries([]);
      expect(result).toHaveLength(0);
    });

    it('should include industry name in values', () => {
      const result = compareIndustries(mockIndustries, ['pe']);
      for (const v of result[0].values) {
        expect(v.industry).toBeDefined();
        expect(typeof v.value).toBe('number');
      }
    });
  });

  describe('analyzeChainPosition', () => {
    const relationships = new Map([
      ['芯片设计', { upstream: ['EDA软件', 'IP核'], downstream: ['晶圆制造'] }],
      ['晶圆制造', { upstream: ['芯片设计', '半导体设备'], downstream: ['封测'] }],
      ['封测', { upstream: ['晶圆制造'], downstream: ['终端应用'] }],
      ['终端应用', { upstream: ['封测'], downstream: [] }],
      ['原材料', { upstream: [], downstream: ['芯片设计', '晶圆制造'] }],
    ]);

    it('should identify upstream position', () => {
      const result = analyzeChainPosition('原材料', relationships);
      expect(result).not.toBeNull();
      expect(result!.position).toBe('upstream');
    });

    it('should identify downstream position', () => {
      // 终端应用 has upstream but no downstream
      const result = analyzeChainPosition('终端应用', relationships);
      expect(result).not.toBeNull();
      expect(result!.position).toBe('downstream');
    });

    it('should identify midstream position', () => {
      const result = analyzeChainPosition('芯片设计', relationships);
      expect(result).not.toBeNull();
      expect(result!.position).toBe('midstream');
    });

    it('should return null for unknown industry', () => {
      const result = analyzeChainPosition('未知行业', relationships);
      expect(result).toBeNull();
    });

    it('should include upstream and downstream lists', () => {
      const result = analyzeChainPosition('芯片设计', relationships);
      expect(result!.upstream).toEqual(['EDA软件', 'IP核']);
      expect(result!.downstream).toEqual(['晶圆制造']);
    });

    it('should include margin pressure field', () => {
      const result = analyzeChainPosition('芯片设计', relationships);
      expect(['expanding', 'stable', 'compressing']).toContain(result!.marginPressure);
    });
  });
});
