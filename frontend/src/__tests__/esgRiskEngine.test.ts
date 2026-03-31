import { describe, it, expect } from 'vitest';
import { assessESGRisk, ESGMetrics } from '../utils/esgRiskEngine';

describe('ESG风险评估引擎', () => {
  const goodESG: ESGMetrics = {
    carbonEmission: 10_000, energyConsumption: 50_000, wasteGenerated: 500,
    renewableEnergyRatio: 0.5, waterUsage: 100_000,
    employeeCount: 5000, turnoverRate: 0.08, safetyIncidents: 0,
    diversityRatio: 0.45, communityInvestment: 5000,
    boardSize: 11, independentDirectorRatio: 0.6, femaleDirectorRatio: 0.3,
    ceoPayRatio: 20, auditIssues: 0, relatedPartyTransactions: 1000,
    revenue: 1_000_000,
  };

  const badESG: ESGMetrics = {
    carbonEmission: 500_000, energyConsumption: 800_000, wasteGenerated: 50_000,
    renewableEnergyRatio: 0.05, waterUsage: 2_000_000,
    employeeCount: 10000, turnoverRate: 0.35, safetyIncidents: 8,
    diversityRatio: 0.1, communityInvestment: 100,
    boardSize: 5, independentDirectorRatio: 0.2, femaleDirectorRatio: 0.05,
    ceoPayRatio: 120, auditIssues: 3, relatedPartyTransactions: 50000,
    revenue: 500_000,
  };

  it('应计算环境评分', () => {
    const r = assessESGRisk(goodESG);
    expect(r.environmentScore).toBeGreaterThan(70);
  });

  it('应计算社会评分', () => {
    const r = assessESGRisk(goodESG);
    expect(r.socialScore).toBeGreaterThan(60);
  });

  it('应计算治理评分', () => {
    const r = assessESGRisk(goodESG);
    expect(r.governanceScore).toBeGreaterThan(60);
  });

  it('好ESG应获高分', () => {
    const r = assessESGRisk(goodESG);
    expect(r.totalScore).toBeGreaterThan(60);
  });

  it('差ESG应获低分', () => {
    const r = assessESGRisk(badESG);
    expect(r.totalScore).toBeLessThan(65);
  });

  it('差ESG应有风险信号', () => {
    const r = assessESGRisk(badESG);
    expect(r.keyRisks.length).toBeGreaterThan(0);
  });

  it('应输出ESG等级', () => {
    const r = assessESGRisk(goodESG);
    expect(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC']).toContain(r.esgGrade);
  });

  it('应计算碳排放强度', () => {
    const r = assessESGRisk(goodESG);
    expect(r.carbonIntensity).toBeGreaterThan(0);
  });

  it('应评估披露完整度', () => {
    const r = assessESGRisk(goodESG);
    expect(r.disclosureCompleteness).toBeGreaterThan(0);
  });

  it('评分应在0-100范围内', () => {
    const r = assessESGRisk(badESG);
    expect(r.totalScore).toBeGreaterThanOrEqual(0);
    expect(r.totalScore).toBeLessThanOrEqual(100);
  });
});
