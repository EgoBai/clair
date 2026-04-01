import { describe, it, expect } from 'vitest';

/**
 * ST/退市风险预警引擎测试
 */

interface FinancialData {
  revenue: number;
  netProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  auditOpinion: 'unqualified' | 'qualified' | 'disclaimer' | 'adverse';
  hasFraudRisk: boolean;
  relatedPartyTransactions: number;
  operatingCashFlow: number;
}

interface STRiskIndicator {
  indicator: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isTriggered: boolean;
}

interface STStockInfo {
  code: string;
  name: string;
  currentStatus: 'normal' | 'ST' | '*ST' | 'delisted' | 'suspend';
  industry: string;
  marketCap: number;
  stockPrice: number;
  consecutiveLossYears: number;
  latestFinancials: FinancialData;
}

function evaluateSTRisk(stock: STStockInfo): { score: number; riskLevel: string; indicators: STRiskIndicator[]; shouldAlert: boolean } {
  const indicators: STRiskIndicator[] = [];
  let score = 0;

  // 连续亏损
  const lossTriggered = stock.consecutiveLossYears >= 2;
  indicators.push({ indicator: 'consecutive_loss', value: stock.consecutiveLossYears, threshold: 2, severity: lossTriggered ? 'critical' : 'low', isTriggered: lossTriggered });
  if (lossTriggered) score += 30;

  // 营收低于1亿
  const revTriggered = stock.latestFinancials.revenue < 1;
  indicators.push({ indicator: 'low_revenue', value: stock.latestFinancials.revenue, threshold: 1, severity: revTriggered ? 'high' : 'low', isTriggered: revTriggered });
  if (revTriggered) score += 20;

  // 审计意见异常
  const auditBad = stock.latestFinancials.auditOpinion !== 'unqualified';
  indicators.push({ indicator: 'audit_opinion', value: auditBad ? 1 : 0, threshold: 0, severity: auditBad ? 'high' : 'low', isTriggered: auditBad });
  if (auditBad) score += 20;

  // 资不抵债
  const insolvent = stock.latestFinancials.totalLiabilities > stock.latestFinancials.totalAssets;
  indicators.push({ indicator: 'insolvency', value: stock.latestFinancials.totalLiabilities / Math.max(1, stock.latestFinancials.totalAssets), threshold: 1, severity: insolvent ? 'critical' : 'low', isTriggered: insolvent });
  if (insolvent) score += 25;

  // 股价低于1元
  const priceLow = stock.stockPrice < 1;
  if (priceLow) score += 30;

  // 财务造假风险
  if (stock.latestFinancials.hasFraudRisk) score += 15;

  const riskLevel = score >= 60 ? 'critical' : score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';
  return { score: Math.min(100, score), riskLevel, indicators, shouldAlert: score >= 40 };
}

function calculateDelistingProbability(stock: STStockInfo): number {
  let prob = 0;
  if (stock.currentStatus === '*ST') prob += 0.3;
  else if (stock.currentStatus === 'ST') prob += 0.15;
  prob += Math.min(0.3, stock.consecutiveLossYears * 0.1);
  if (stock.stockPrice < 1) prob += 0.25;
  if (stock.latestFinancials.auditOpinion === 'disclaimer' || stock.latestFinancials.auditOpinion === 'adverse') prob += 0.2;
  if (stock.latestFinancials.hasFraudRisk) prob += 0.15;
  return Math.min(1, parseFloat(prob.toFixed(4)));
}

describe('ST退市风险预警引擎', () => {
  const makeStock = (overrides: Partial<STStockInfo> = {}): STStockInfo => ({
    code: '000001', name: 'Test', currentStatus: 'normal', industry: 'Tech',
    marketCap: 10, stockPrice: 10, consecutiveLossYears: 0,
    latestFinancials: {
      revenue: 50, netProfit: 5, totalAssets: 100, totalLiabilities: 40,
      auditOpinion: 'unqualified', hasFraudRisk: false,
      relatedPartyTransactions: 0, operatingCashFlow: 3,
    },
    ...overrides,
  });

  describe('evaluateSTRisk', () => {
    it('should return low risk for healthy stock', () => {
      const result = evaluateSTRisk(makeStock());
      expect(result.riskLevel).toBe('low');
      expect(result.shouldAlert).toBe(false);
    });

    it('should flag consecutive losses', () => {
      const result = evaluateSTRisk(makeStock({ consecutiveLossYears: 3 }));
      expect(result.score).toBeGreaterThanOrEqual(30);
      expect(result.indicators.find(i => i.indicator === 'consecutive_loss')?.isTriggered).toBe(true);
    });

    it('should flag low revenue', () => {
      const result = evaluateSTRisk(makeStock({ latestFinancials: { revenue: 0.5, netProfit: -1, totalAssets: 100, totalLiabilities: 40, auditOpinion: 'unqualified', hasFraudRisk: false, relatedPartyTransactions: 0, operatingCashFlow: 0 } }));
      expect(result.indicators.find(i => i.indicator === 'low_revenue')?.isTriggered).toBe(true);
    });

    it('should flag insolvency', () => {
      const result = evaluateSTRisk(makeStock({ latestFinancials: { revenue: 10, netProfit: 1, totalAssets: 50, totalLiabilities: 80, auditOpinion: 'unqualified', hasFraudRisk: false, relatedPartyTransactions: 0, operatingCashFlow: 0 } }));
      expect(result.indicators.find(i => i.indicator === 'insolvency')?.isTriggered).toBe(true);
    });

    it('should be critical for multiple triggers', () => {
      const result = evaluateSTRisk(makeStock({
        consecutiveLossYears: 3, stockPrice: 0.5,
        latestFinancials: { revenue: 0.5, netProfit: -2, totalAssets: 50, totalLiabilities: 80, auditOpinion: 'adverse', hasFraudRisk: true, relatedPartyTransactions: 10, operatingCashFlow: -1 },
      }));
      expect(result.riskLevel).toBe('critical');
      expect(result.shouldAlert).toBe(true);
    });
  });

  describe('calculateDelistingProbability', () => {
    it('should be 0 for healthy stock', () => {
      expect(calculateDelistingProbability(makeStock())).toBe(0);
    });

    it('should increase for *ST stocks', () => {
      expect(calculateDelistingProbability(makeStock({ currentStatus: '*ST' }))).toBeGreaterThan(0);
    });

    it('should be 0-1', () => {
      const prob = calculateDelistingProbability(makeStock({ currentStatus: '*ST', consecutiveLossYears: 5, stockPrice: 0.3 }));
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    });
  });
});
