import { describe, it, expect } from 'vitest';
import { analyzeRelativeValue } from '../utils/relativeValueEngine';
import type { ComparableCompany } from '../utils/relativeValueEngine';

describe('RelativeValueEngine', () => {
  const makeCompany = (overrides: Partial<ComparableCompany> = {}): ComparableCompany => ({
    code: '000001',
    name: '测试公司',
    industry: '科技',
    marketCap: 1000000000,
    ev: 1200000000,
    ebitda: 200000000,
    netIncome: 100000000,
    growth: 15,
    pe: 15,
    pb: 2.5,
    roe: 15,
    ...overrides,
  });

  const sampleCompanies: ComparableCompany[] = [
    makeCompany({ code: 'A', name: '科技A', industry: '科技', pe: 10, pb: 1.5, growth: 20, ev: 1000000000, ebitda: 200000000 }),
    makeCompany({ code: 'B', name: '科技B', industry: '科技', pe: 20, pb: 3.0, growth: 10, ev: 2000000000, ebitda: 200000000 }),
    makeCompany({ code: 'C', name: '消费C', industry: '消费', pe: 15, pb: 2.0, growth: 12, ev: 1500000000, ebitda: 300000000 }),
    makeCompany({ code: 'D', name: '消费D', industry: '消费', pe: 25, pb: 4.0, growth: 8, ev: 2500000000, ebitda: 250000000 }),
  ];

  describe('相对价值分析', () => {
    it('应返回分析结果', () => {
      const analysis = analyzeRelativeValue(sampleCompanies);
      expect(analysis.results.length).toBe(4);
      expect(analysis.industryStats.length).toBe(2);
    });

    it('应计算行业统计', () => {
      const analysis = analyzeRelativeValue(sampleCompanies);
      const techStats = analysis.industryStats.find(s => s.industry === '科技');
      expect(techStats).toBeDefined();
      expect(techStats!.count).toBe(2);
      expect(techStats!.avgPE).toBeCloseTo(15, 0); // (10+20)/2
    });

    it('应计算相对PE', () => {
      const analysis = analyzeRelativeValue(sampleCompanies);
      const compA = analysis.results.find(r => r.code === 'A');
      expect(compA).toBeDefined();
      expect(compA!.peRelative).toBeLessThan(1); // PE低于行业均值
    });

    it('应识别低估股票', () => {
      const analysis = analyzeRelativeValue(sampleCompanies);
      const topPicks = analysis.topPicks;
      expect(topPicks.length).toBeGreaterThan(0);
      topPicks.forEach(p => {
        expect(p.signal).toBe('undervalued');
      });
    });

    it('应按折价排序topPicks', () => {
      const analysis = analyzeRelativeValue(sampleCompanies);
      for (let i = 1; i < analysis.topPicks.length; i++) {
        expect(analysis.topPicks[i - 1].compositeDiscount).toBeGreaterThanOrEqual(analysis.topPicks[i].compositeDiscount);
      }
    });

    it('应识别套利机会', () => {
      const analysis = analyzeRelativeValue(sampleCompanies);
      expect(Array.isArray(analysis.arbitrageOpportunities)).toBe(true);
    });

    it('信号类型应有效', () => {
      const analysis = analyzeRelativeValue(sampleCompanies);
      analysis.results.forEach(r => {
        expect(['undervalued', 'fairly_valued', 'overvalued']).toContain(r.signal);
      });
    });

    it('置信度应在0-1之间', () => {
      const analysis = analyzeRelativeValue(sampleCompanies);
      analysis.results.forEach(r => {
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('排名应为正整数', () => {
      const analysis = analyzeRelativeValue(sampleCompanies);
      analysis.results.forEach(r => {
        expect(r.rankInIndustry).toBeGreaterThan(0);
        expect(Number.isInteger(r.rankInIndustry)).toBe(true);
      });
    });
  });

  describe('边界情况', () => {
    it('空数据应抛出错误', () => {
      expect(() => analyzeRelativeValue([])).toThrow();
    });

    it('单家公司应返回单个结果', () => {
      const analysis = analyzeRelativeValue([makeCompany()]);
      expect(analysis.results.length).toBe(1);
      expect(analysis.results[0].rankInIndustry).toBe(1);
    });

    it('零EBITDA不应报错', () => {
      expect(() => analyzeRelativeValue([makeCompany({ ebitda: 0 })])).not.toThrow();
    });

    it('零增长率不应报错', () => {
      expect(() => analyzeRelativeValue([makeCompany({ growth: 0 })])).not.toThrow();
    });

    it('负PE不应报错', () => {
      expect(() => analyzeRelativeValue([makeCompany({ pe: -5 })])).not.toThrow();
    });

    it('单一行业不应有套利机会', () => {
      const analysis = analyzeRelativeValue([
        makeCompany({ code: 'X', industry: '单一', pe: 10 }),
      ]);
      expect(analysis.arbitrageOpportunities.length).toBe(0);
    });

    it('极端EV/EBITDA不应报错', () => {
      expect(() => analyzeRelativeValue([makeCompany({ ev: 1e12, ebitda: 1 })])).not.toThrow();
    });
  });
});
