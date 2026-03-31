import { describe, it, expect } from 'vitest';
import {
  assessPledgeRisk,
  assessMarginRisk,
  assessUnlockRisk,
  assessReductionRisk,
  compositeRiskScore,
  type PledgePosition,
  type MarginPosition,
} from '../utils/forcedLiquidationEngine';

describe('ForcedLiquidationEngine', () => {
  const pledgePositions: PledgePosition[] = [
    {
      stockCode: '000001',
      shareholder: '大股东A',
      pledgedShares: 5000000,
      totalShares: 10000000,
      pledgeee: '银行B',
      pledgeDate: '2024-01-01',
      maturityDate: '2025-01-01',
      currentPrice: 8.5,
      estimatedAlertPrice: 8.0,
      estimatedLiquidationPrice: 7.0,
    },
    {
      stockCode: '000002',
      shareholder: '大股东C',
      pledgedShares: 8000000,
      totalShares: 10000000,
      pledgeee: '券商D',
      pledgeDate: '2024-06-01',
      maturityDate: '2025-06-01',
      currentPrice: 7.2,
      estimatedAlertPrice: 7.5,
      estimatedLiquidationPrice: 6.5,
    },
  ];

  it('should assess pledge risk correctly', () => {
    const risks = assessPledgeRisk(pledgePositions);
    expect(risks.length).toBe(2);
    // Should be sorted by score descending
    expect(risks[0].score).toBeGreaterThanOrEqual(risks[1].score);
    for (const r of risks) {
      expect(['low', 'medium', 'high', 'critical']).toContain(r.riskLevel);
      expect(r.riskType).toBe('pledge');
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
    // Stock 000002 should have higher risk (below alert line)
    const risk002 = risks.find(r => r.stockCode === '000002')!;
    expect(risk002.riskLevel).toBe('high');
  });

  it('should detect critical pledge risk', () => {
    const critical = [{
      ...pledgePositions[0],
      currentPrice: 6.5, // Below liquidation price
    }];
    const risks = assessPledgeRisk(critical);
    expect(risks[0].riskLevel).toBe('critical');
    expect(risks[0].score).toBe(95);
  });

  const marginPositions: MarginPosition[] = [
    {
      stockCode: '000001',
      marginBalance: 500000,
      collateralValue: 800000,
      maintenanceRatio: 1.5,
      currentRatio: 1.6,
      alertLine: 1.4,
      liquidationLine: 1.3,
    },
    {
      stockCode: '000002',
      marginBalance: 300000,
      collateralValue: 380000,
      maintenanceRatio: 1.5,
      currentRatio: 1.35,
      alertLine: 1.4,
      liquidationLine: 1.3,
    },
  ];

  it('should assess margin risk correctly', () => {
    const risks = assessMarginRisk(marginPositions);
    expect(risks.length).toBe(2);
    // Stock 000002 is below alert line
    const risk002 = risks.find(r => r.stockCode === '000002')!;
    expect(risk002.riskLevel).toBe('high');
  });

  it('should detect critical margin risk', () => {
    const critical = [{
      ...marginPositions[0],
      currentRatio: 1.25,
    }];
    const risks = assessMarginRisk(critical);
    expect(risks[0].riskLevel).toBe('critical');
  });

  it('should assess unlock risk', () => {
    const unlocks = [
      {
        stockCode: '000001',
        unlockDate: '2025-03-01',
        unlockShares: 2000000,
        totalFloat: 10000000,
        costPrice: 5.0,
        currentPrice: 10.0,
        holderType: 'insider' as const,
      },
      {
        stockCode: '000002',
        unlockDate: '2025-03-15',
        unlockShares: 500000,
        totalFloat: 10000000,
        costPrice: 9.0,
        currentPrice: 9.5,
        holderType: 'institutional' as const,
      },
    ];
    const risks = assessUnlockRisk(unlocks);
    expect(risks.length).toBe(2);
    // First one has higher risk (larger float %, higher profit, insider)
    expect(risks[0].score).toBeGreaterThan(risks[1].score);
  });

  it('should assess reduction risk', () => {
    const plans = [
      {
        stockCode: '000001',
        shareholder: '大股东A',
        plannedShares: 1000000,
        totalShares: 100000000,
        percentOfFloat: 0.05,
        method: '集中竞价' as const,
        startDate: '2025-01-15',
        endDate: '2025-07-15',
      },
      {
        stockCode: '000002',
        shareholder: '大股东B',
        plannedShares: 500000,
        totalShares: 100000000,
        percentOfFloat: 0.01,
        method: '协议转让' as const,
        startDate: '2025-01-15',
        endDate: '2025-04-15',
      },
    ];
    const risks = assessReductionRisk(plans);
    expect(risks.length).toBe(2);
    // 集中竞价 has more impact than 协议转让
    expect(risks[0].score).toBeGreaterThanOrEqual(risks[1].score);
  });

  it('should compute composite risk score', () => {
    const risks = [
      { stockCode: '001', riskType: 'pledge' as const, riskLevel: 'high' as const, score: 75, description: '', triggerPrice: 0, currentPrice: 0, distanceToTrigger: 0, estimatedImpact: 0 },
      { stockCode: '002', riskType: 'margin' as const, riskLevel: 'medium' as const, score: 50, description: '', triggerPrice: 0, currentPrice: 0, distanceToTrigger: 0, estimatedImpact: 0 },
      { stockCode: '003', riskType: 'unlock' as const, riskLevel: 'low' as const, score: 20, description: '', triggerPrice: 0, currentPrice: 0, distanceToTrigger: 0, estimatedImpact: 0 },
    ];
    const result = compositeRiskScore(risks);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(['low', 'medium', 'high', 'critical']).toContain(result.level);
    expect(result.topRisks.length).toBe(3);
    expect(result.byType['pledge']).toBeDefined();
    expect(result.byType['pledge'].count).toBe(1);
  });

  it('should handle empty risks for composite', () => {
    const result = compositeRiskScore([]);
    expect(result.overallScore).toBe(0);
    expect(result.level).toBe('low');
  });

  it('should handle empty pledge positions', () => {
    expect(assessPledgeRisk([])).toHaveLength(0);
  });

  it('should handle empty margin positions', () => {
    expect(assessMarginRisk([])).toHaveLength(0);
  });
});
