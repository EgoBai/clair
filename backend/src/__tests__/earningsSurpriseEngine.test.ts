import { describe, it, expect } from 'vitest';

/**
 * 财报异动检测引擎测试
 */

interface FinancialReport {
  symbol: string;
  period: string;
  revenue: number;
  netIncome: number;
  grossProfit: number;
  operatingCashFlow: number;
  totalAssets: number;
  totalLiabilities: number;
  eps: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  debtToAsset: number;
  currentRatio: number;
}

interface SurpriseSignal {
  category: string;
  name: string;
  severity: 'high' | 'medium' | 'low';
  detail: string;
  changePercent: number;
}

function detectEarningsSurprise(current: FinancialReport, previous: FinancialReport): {
  signals: SurpriseSignal[];
  score: number;
  type: 'positive' | 'negative' | 'neutral';
} {
  const signals: SurpriseSignal[] = [];

  const revChange = previous.revenue !== 0 ? (current.revenue - previous.revenue) / Math.abs(previous.revenue) : 0;
  if (revChange > 0.3) signals.push({ category: 'revenue', name: '营收大增', severity: 'high', detail: `营收增长${(revChange * 100).toFixed(1)}%`, changePercent: revChange * 100 });
  else if (revChange < -0.2) signals.push({ category: 'revenue', name: '营收下滑', severity: 'high', detail: `营收下降${(Math.abs(revChange) * 100).toFixed(1)}%`, changePercent: revChange * 100 });

  const marginChange = current.grossMargin - previous.grossMargin;
  if (marginChange > 5) signals.push({ category: 'margin', name: '毛利率提升', severity: 'medium', detail: `毛利率提升${marginChange.toFixed(1)}个百分点`, changePercent: marginChange });
  else if (marginChange < -5) signals.push({ category: 'margin', name: '毛利率下降', severity: 'medium', detail: `毛利率下降${Math.abs(marginChange).toFixed(1)}个百分点`, changePercent: marginChange });

  const cfDiff = current.netIncome > 0 ? (current.operatingCashFlow - current.netIncome) / current.netIncome : 0;
  if (cfDiff < -0.3) signals.push({ category: 'cashflow', name: '现金流与利润背离', severity: 'high', detail: `经营现金流仅为净利润的${((1 + cfDiff) * 100).toFixed(0)}%`, changePercent: cfDiff * 100 });

  const epsChange = previous.eps !== 0 ? (current.eps - previous.eps) / Math.abs(previous.eps) : 0;
  if (epsChange > 0.5) signals.push({ category: 'earnings', name: 'EPS超预期', severity: 'high', detail: `EPS增长${(epsChange * 100).toFixed(1)}%`, changePercent: epsChange * 100 });

  const posSignals = signals.filter(s => ['营收大增', '毛利率提升', 'EPS超预期'].includes(s.name));
  const negSignals = signals.filter(s => ['营收下滑', '毛利率下降', '现金流与利润背离'].includes(s.name));
  const score = Math.min(100, Math.abs(posSignals.length - negSignals.length) * 30 + signals.filter(s => s.severity === 'high').length * 15);
  const type = posSignals.length > negSignals.length ? 'positive' : negSignals.length > posSignals.length ? 'negative' : 'neutral';

  return { signals, score, type };
}

function calculateFinancialHealth(report: FinancialReport): { score: number; grade: string; warnings: string[] } {
  const warnings: string[] = [];
  let score = 0;

  if (report.roe > 15) score += 25;
  else if (report.roe > 10) score += 15;
  else if (report.roe < 5) warnings.push('ROE偏低');

  if (report.grossMargin > 40) score += 25;
  else if (report.grossMargin > 20) score += 15;
  else warnings.push('毛利率偏低');

  if (report.currentRatio > 1.5) score += 25;
  else if (report.currentRatio > 1) score += 15;
  else warnings.push('流动比率不足');

  if (report.debtToAsset < 50) score += 25;
  else if (report.debtToAsset < 70) score += 15;
  else warnings.push('资产负债率过高');

  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  return { score, grade, warnings };
}

describe('财报异动检测引擎', () => {
  const baseReport: FinancialReport = {
    symbol: '600519', period: '2024Q1',
    revenue: 1000000, netIncome: 200000, grossProfit: 600000,
    operatingCashFlow: 250000, totalAssets: 5000000, totalLiabilities: 2000000,
    eps: 2.5, roe: 20, grossMargin: 60, netMargin: 20, debtToAsset: 40, currentRatio: 2.5,
  };

  describe('detectEarningsSurprise', () => {
    it('should detect revenue surge', () => {
      const prev = { ...baseReport, revenue: 500000 };
      const curr = { ...baseReport, revenue: 1000000 };
      const result = detectEarningsSurprise(curr, prev);
      expect(result.signals.some(s => s.name === '营收大增')).toBe(true);
      expect(result.type).toBe('positive');
    });

    it('should detect revenue decline', () => {
      const prev = { ...baseReport, revenue: 1000000 };
      const curr = { ...baseReport, revenue: 700000 };
      const result = detectEarningsSurprise(curr, prev);
      expect(result.signals.some(s => s.name === '营收下滑')).toBe(true);
    });

    it('should detect margin changes', () => {
      const prev = { ...baseReport, grossMargin: 50 };
      const curr = { ...baseReport, grossMargin: 60 };
      const result = detectEarningsSurprise(curr, prev);
      expect(result.signals.some(s => s.name === '毛利率提升')).toBe(true);
    });

    it('should detect cashflow divergence', () => {
      const curr = { ...baseReport, netIncome: 200000, operatingCashFlow: 50000 };
      const result = detectEarningsSurprise(curr, baseReport);
      expect(result.signals.some(s => s.name === '现金流与利润背离')).toBe(true);
    });

    it('should return neutral for unchanged reports', () => {
      const result = detectEarningsSurprise(baseReport, baseReport);
      expect(result.type).toBe('neutral');
    });

    it('score should be 0-100', () => {
      const result = detectEarningsSurprise(baseReport, baseReport);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateFinancialHealth', () => {
    it('should grade A for strong financials', () => {
      const result = calculateFinancialHealth(baseReport);
      expect(result.grade).toBe('A');
      expect(result.score).toBe(100);
    });

    it('should warn about weak financials', () => {
      const weak = { ...baseReport, roe: 3, grossMargin: 10, currentRatio: 0.8, debtToAsset: 80 };
      const result = calculateFinancialHealth(weak);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.grade).toBe('D');
    });
  });
});
