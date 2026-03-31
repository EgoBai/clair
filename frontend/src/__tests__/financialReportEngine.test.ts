import { describe, it, expect } from 'vitest';
import {
  calculateYoYGrowth,
  calculateQoQGrowth,
  analyzeGrowth,
  performDuPontAnalysis,
  evaluateFinancialHealth,
  detectWarningSignals,
  type FinancialReport,
} from '../utils/financialReportEngine';

const mockReport = (overrides: Partial<FinancialReport> = {}): FinancialReport => ({
  period: '2025-Q4',
  revenue: 100000,
  netProfit: 15000,
  grossProfit: 40000,
  operatingProfit: 18000,
  totalAssets: 200000,
  totalEquity: 120000,
  totalDebt: 80000,
  operatingCashFlow: 20000,
  investingCashFlow: -5000,
  financingCashFlow: -3000,
  currentAssets: 60000,
  currentLiabilities: 30000,
  inventory: 10000,
  accountsReceivable: 15000,
  eps: 1.5,
  roe: 12.5,
  roa: 7.5,
  ...overrides,
});

function generateReports(count: number): FinancialReport[] {
  const reports: FinancialReport[] = [];
  for (let i = 0; i < count; i++) {
    const q = (i % 4) + 1;
    const year = 2024 + Math.floor(i / 4);
    reports.push(mockReport({
      period: `${year}-Q${q}`,
      revenue: 80000 + i * 5000,
      netProfit: 10000 + i * 1500,
    }));
  }
  return reports;
}

describe('财报分析引擎', () => {
  describe('calculateYoYGrowth', () => {
    it('should calculate correct YoY growth', () => {
      expect(calculateYoYGrowth(110, 100)).toBeCloseTo(10, 1);
    });

    it('should handle negative growth', () => {
      expect(calculateYoYGrowth(90, 100)).toBeCloseTo(-10, 1);
    });

    it('should handle zero previous', () => {
      expect(calculateYoYGrowth(100, 0)).toBe(100);
    });

    it('should handle both zero', () => {
      expect(calculateYoYGrowth(0, 0)).toBe(0);
    });
  });

  describe('calculateQoQGrowth', () => {
    it('should calculate correct QoQ growth', () => {
      expect(calculateQoQGrowth(120, 100)).toBeCloseTo(20, 1);
    });

    it('should handle zero base', () => {
      expect(calculateQoQGrowth(50, 0)).toBe(100);
    });
  });

  describe('analyzeGrowth', () => {
    it('should return growth for multiple metrics', () => {
      const reports = generateReports(8);
      const growth = analyzeGrowth(reports);
      expect(growth.length).toBeGreaterThan(0);
    });

    it('should calculate YoY and QoQ', () => {
      const reports = generateReports(8);
      const growth = analyzeGrowth(reports);
      growth.forEach(g => {
        expect(typeof g.yoyGrowth).toBe('number');
        expect(typeof g.qoqGrowth).toBe('number');
      });
    });

    it('should assign trend direction', () => {
      const reports = generateReports(8);
      const growth = analyzeGrowth(reports);
      growth.forEach(g => {
        expect(['accelerating', 'steady', 'decelerating', 'declining']).toContain(g.trend);
      });
    });

    it('should return empty for insufficient data', () => {
      expect(analyzeGrowth([mockReport()])).toHaveLength(0);
    });
  });

  describe('performDuPontAnalysis', () => {
    it('should calculate ROE from three components', () => {
      const report = mockReport();
      const result = performDuPontAnalysis(report);
      expect(result.roe).toBeGreaterThan(0);
    });

    it('should identify primary driver', () => {
      const report = mockReport();
      const result = performDuPontAnalysis(report);
      expect(['profitability', 'efficiency', 'leverage']).toContain(result.primaryDriver);
    });

    it('should provide interpretation', () => {
      const report = mockReport();
      const result = performDuPontAnalysis(report);
      expect(result.interpretation).toBeTruthy();
    });

    it('should handle profitability-driven company', () => {
      const report = mockReport({
        revenue: 100000, netProfit: 30000,
        totalAssets: 500000, totalEquity: 100000,
      });
      const result = performDuPontAnalysis(report);
      expect(result.netProfitMargin).toBeGreaterThan(0);
    });

    it('should handle zero revenue', () => {
      const report = mockReport({ revenue: 0, netProfit: 0 });
      const result = performDuPontAnalysis(report);
      expect(result.netProfitMargin).toBe(0);
    });
  });

  describe('evaluateFinancialHealth', () => {
    it('should return score 0-100', () => {
      const health = evaluateFinancialHealth(mockReport());
      expect(health.score).toBeGreaterThanOrEqual(0);
      expect(health.score).toBeLessThanOrEqual(100);
    });

    it('should assign grade', () => {
      const health = evaluateFinancialHealth(mockReport());
      expect(['A', 'B', 'C', 'D', 'F']).toContain(health.grade);
    });

    it('should calculate liquidity ratios', () => {
      const health = evaluateFinancialHealth(mockReport());
      expect(health.liquidity.currentRatio).toBeGreaterThan(0);
      expect(health.liquidity.quickRatio).toBeGreaterThanOrEqual(0);
    });

    it('should calculate solvency ratios', () => {
      const health = evaluateFinancialHealth(mockReport());
      expect(health.solvency.debtToEquity).toBeGreaterThan(0);
    });

    it('should give high score to healthy company', () => {
      const healthy = mockReport({
        currentAssets: 100000, currentLiabilities: 20000,
        totalDebt: 10000, totalEquity: 150000,
        inventory: 5000, accountsReceivable: 5000,
        revenue: 100000, grossProfit: 50000, netProfit: 20000,
        roe: 20,
      });
      const health = evaluateFinancialHealth(healthy);
      expect(health.score).toBeGreaterThan(50);
    });

    it('should give low score to unhealthy company', () => {
      const unhealthy = mockReport({
        currentAssets: 10000, currentLiabilities: 50000,
        totalDebt: 200000, totalEquity: 20000,
        revenue: 50000, grossProfit: 5000, netProfit: -5000,
        roe: -25,
      });
      const health = evaluateFinancialHealth(unhealthy);
      expect(health.score).toBeLessThan(50);
    });
  });

  describe('detectWarningSignals', () => {
    it('should detect revenue decline', () => {
      const current = mockReport({ revenue: 70000 });
      const previous = mockReport({ revenue: 100000 });
      const signals = detectWarningSignals(current, previous);
      expect(signals.some(s => s.type === 'revenue_decline')).toBe(true);
    });

    it('should detect cash flow mismatch', () => {
      const current = mockReport({ netProfit: 15000, operatingCashFlow: 2000 });
      const signals = detectWarningSignals(current);
      expect(signals.some(s => s.type === 'cash_flow_mismatch')).toBe(true);
    });

    it('should detect high leverage', () => {
      const current = mockReport({ totalDebt: 300000, totalEquity: 50000 });
      const signals = detectWarningSignals(current);
      expect(signals.some(s => s.type === 'high_leverage')).toBe(true);
    });

    it('should detect profit without cash', () => {
      const current = mockReport({ netProfit: 10000, operatingCashFlow: -5000 });
      const signals = detectWarningSignals(current);
      expect(signals.some(s => s.type === 'profit_without_cash')).toBe(true);
    });

    it('should detect inventory buildup', () => {
      const current = mockReport({ inventory: 30000, revenue: 80000 });
      const previous = mockReport({ inventory: 10000, revenue: 100000 });
      const signals = detectWarningSignals(current, previous);
      expect(signals.some(s => s.type === 'inventory_buildup')).toBe(true);
    });

    it('should return empty for healthy company', () => {
      const current = mockReport();
      const signals = detectWarningSignals(current);
      expect(signals).toHaveLength(0);
    });

    it('should sort by severity', () => {
      const current = mockReport({
        revenue: 50000, netProfit: -2000, operatingCashFlow: -10000,
        totalDebt: 300000, totalEquity: 50000,
      });
      const previous = mockReport({ revenue: 100000, netProfit: 15000 });
      const signals = detectWarningSignals(current, previous);
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < signals.length; i++) {
        expect(order[signals[i - 1].severity]).toBeLessThanOrEqual(order[signals[i].severity]);
      }
    });

    it('should include description for each signal', () => {
      const current = mockReport({ netProfit: 10000, operatingCashFlow: -5000 });
      const signals = detectWarningSignals(current);
      signals.forEach(s => {
        expect(s.description).toBeTruthy();
        expect(s.value).toBeDefined();
        expect(s.threshold).toBeDefined();
      });
    });
  });
});
