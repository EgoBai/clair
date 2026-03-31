import { describe, it, expect } from 'vitest';
import { analyzePatents, PatentData } from '../utils/patentAnalysisEngine';

describe('专利分析引擎', () => {
  const data: PatentData = {
    totalPatents: 500,
    validPatents: 380,
    expiredPatents: 120,
    applications: [
      { year: 2020, count: 60 }, { year: 2021, count: 75 },
      { year: 2022, count: 90 }, { year: 2023, count: 110 },
    ],
    citations: Array.from({ length: 50 }, (_, i) => ({ patentId: `P${i}`, citedBy: Math.floor(Math.random() * 10) })),
    fields: [
      { name: 'AI', count: 200 }, { name: '云计算', count: 150 },
      { name: '芯片', count: 100 }, { name: '物联网', count: 50 },
    ],
    rdExpense: 500_000,
    revenue: 5_000_000,
    industryAvgPatentsPerBillion: 80,
    competitorPatents: [300, 400, 250, 600],
  };

  it('应计算专利增长率', () => {
    const r = analyzePatents(data);
    expect(r.patentGrowthRate).toBeGreaterThan(0);
  });

  it('应计算有效率', () => {
    const r = analyzePatents(data);
    expect(r.validityRate).toBe(0.76);
  });

  it('应计算平均被引次数', () => {
    const r = analyzePatents(data);
    expect(r.avgCitations).toBeGreaterThan(0);
  });

  it('应计算技术多样性', () => {
    const r = analyzePatents(data);
    expect(r.techDiversity).toBeGreaterThan(0);
    expect(r.techDiversity).toBeLessThan(1);
  });

  it('应计算研发强度', () => {
    const r = analyzePatents(data);
    expect(r.rdIntensity).toBe(0.1);
  });

  it('应计算每亿收入专利数', () => {
    const r = analyzePatents(data);
    expect(r.patentsPerRevenue).toBeGreaterThan(0);
  });

  it('应评估相对竞争力', () => {
    const r = analyzePatents(data);
    expect(r.relativeStrength).toBeGreaterThan(0);
  });

  it('应输出创新评分', () => {
    const r = analyzePatents(data);
    expect(r.innovationScore).toBeGreaterThan(0);
    expect(r.innovationScore).toBeLessThanOrEqual(100);
  });

  it('应输出创新层级', () => {
    const r = analyzePatents(data);
    expect(['leader', 'follower', 'laggard']).toContain(r.innovationTier);
  });

  it('应输出最强技术领域', () => {
    const r = analyzePatents(data);
    expect(r.topField).toBe('AI');
  });
});
