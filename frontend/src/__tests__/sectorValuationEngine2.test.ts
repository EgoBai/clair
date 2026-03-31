import { describe, it, expect } from 'vitest';
import { analyzeSectorValuations, SectorValuation } from '../utils/sectorValuationEngine2';

describe('板块估值引擎V2', () => {
  const sectors: SectorValuation[] = [
    { name: '银行', pe: 5, pb: 0.6, ps: 1, dividendYield: 0.05, roe: 0.12, profitGrowth: 0.05, pePercentile: 0.1, pbPercentile: 0.15, psPercentile: 0.2, avgPE5y: 6, minPE5y: 4, maxPE5y: 8 },
    { name: '消费', pe: 35, pb: 5, ps: 8, dividendYield: 0.01, roe: 0.2, profitGrowth: 0.15, pePercentile: 0.7, pbPercentile: 0.8, psPercentile: 0.75, avgPE5y: 30, minPE5y: 20, maxPE5y: 50 },
    { name: '科技', pe: 50, pb: 8, ps: 12, dividendYield: 0.002, roe: 0.15, profitGrowth: 0.25, pePercentile: 0.85, pbPercentile: 0.9, psPercentile: 0.88, avgPE5y: 40, minPE5y: 25, maxPE5y: 70 },
  ];

  it('应返回结果数组', () => {
    const r = analyzeSectorValuations(sectors);
    expect(r.length).toBe(3);
  });

  it('应计算估值评分', () => {
    const r = analyzeSectorValuations(sectors);
    r.forEach(s => {
      expect(s.valuationScore).toBeGreaterThanOrEqual(0);
      expect(s.valuationScore).toBeLessThanOrEqual(100);
    });
  });

  it('银行应评分较高(低估值)', () => {
    const r = analyzeSectorValuations(sectors);
    const bank = r.find(s => s.sector === '银行');
    expect(bank?.valuationScore).toBeGreaterThan(60);
  });

  it('科技应评分较低(高估值)', () => {
    const r = analyzeSectorValuations(sectors);
    const tech = r.find(s => s.sector === '科技');
    expect(tech?.valuationScore).toBeLessThan(80);
  });

  it('应判断吸引力', () => {
    const r = analyzeSectorValuations(sectors);
    r.forEach(s => {
      expect(['very_attractive', 'attractive', 'fair', 'expensive', 'very_expensive']).toContain(s.attractiveness);
    });
  });

  it('应计算PE偏离', () => {
    const r = analyzeSectorValuations(sectors);
    r.forEach(s => {
      expect(typeof s.peDeviation).toBe('number');
    });
  });

  it('应输出排名', () => {
    const r = analyzeSectorValuations(sectors);
    const ranks = r.map(s => s.crossSectorRank).sort();
    expect(ranks).toEqual([1, 2, 3]);
  });

  it('应判断均值回归信号', () => {
    const r = analyzeSectorValuations(sectors);
    r.forEach(s => {
      expect(['buy', 'neutral', 'sell']).toContain(s.meanReversionSignal);
    });
  });

  it('数据不足应抛出错误', () => {
    expect(() => analyzeSectorValuations(sectors.slice(0, 1))).toThrow();
  });

  it('应输出洞察', () => {
    const r = analyzeSectorValuations(sectors);
    r.forEach(s => {
      expect(Array.isArray(s.insights)).toBe(true);
    });
  });
});
