import { describe, it, expect } from 'vitest';
import { assessGovernance, GovernanceData } from '../utils/governanceRiskEngine';

describe('公司治理风险引擎', () => {
  const goodGovernance: GovernanceData = {
    largestShareholder: 0.25, top5Shareholders: 0.6, managementHolding: 0.05,
    pledgeRatio: 0.1, isStateOwned: false,
    ceoTenure: 5, boardSize: 9, independentDirectorRatio: 0.5,
    femaleDirectorRatio: 0.3, ceoDuality: false, boardMeetingAttendance: 0.95,
    relatedPartyTransactionRatio: 0.03, insiderTradingIncidents: 0,
    lateDisclosures: 0, correctionNotices: 0, regulatoryPenalties: 0,
    auditOpinion: 'unqualified', revenue: 1000000,
  };

  const badGovernance: GovernanceData = {
    largestShareholder: 0.55, top5Shareholders: 0.7, managementHolding: 0.005,
    pledgeRatio: 0.6, isStateOwned: false,
    ceoTenure: 0.5, boardSize: 5, independentDirectorRatio: 0.2,
    femaleDirectorRatio: 0.05, ceoDuality: true, boardMeetingAttendance: 0.6,
    relatedPartyTransactionRatio: 0.25, insiderTradingIncidents: 2,
    lateDisclosures: 5, correctionNotices: 3, regulatoryPenalties: 1,
    auditOpinion: 'qualified', revenue: 500000,
  };

  it('好治理应有高评分', () => {
    const r = assessGovernance(goodGovernance);
    expect(r.overallScore).toBeGreaterThan(70);
  });

  it('差治理应有低评分', () => {
    const r = assessGovernance(badGovernance);
    expect(r.overallScore).toBeLessThan(60);
  });

  it('差治理应有红旗信号', () => {
    const r = assessGovernance(badGovernance);
    expect(r.redFlags.length).toBeGreaterThan(0);
  });

  it('应输出风险等级', () => {
    const r = assessGovernance(goodGovernance);
    expect(['low', 'medium', 'high', 'critical']).toContain(r.riskLevel);
  });

  it('应输出治理等级', () => {
    const r = assessGovernance(goodGovernance);
    expect(['A', 'B', 'C', 'D']).toContain(r.governanceGrade);
  });

  it('评分应在0-100范围', () => {
    const r = assessGovernance(badGovernance);
    expect(r.overallScore).toBeGreaterThanOrEqual(0);
    expect(r.overallScore).toBeLessThanOrEqual(100);
  });

  it('应输出改进建议', () => {
    const r = assessGovernance(badGovernance);
    expect(Array.isArray(r.recommendations)).toBe(true);
  });

  it('应计算各维度评分', () => {
    const r = assessGovernance(goodGovernance);
    expect(r.ownershipScore).toBeGreaterThanOrEqual(0);
    expect(r.managementScore).toBeGreaterThanOrEqual(0);
    expect(r.relatedPartyScore).toBeGreaterThanOrEqual(0);
    expect(r.disclosureScore).toBeGreaterThanOrEqual(0);
  });

  it('质押比例高应扣分', () => {
    const r = assessGovernance(badGovernance);
    expect(r.ownershipScore).toBeLessThan(100);
  });

  it('审计问题应扣分', () => {
    const r = assessGovernance(badGovernance);
    expect(r.disclosureScore).toBeLessThan(100);
  });
});
