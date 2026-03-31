import { describe, it, expect } from 'vitest';
import { FinancialAnomalyEngine, FinancialStatement } from '../services/financialAnomalyEngine';

describe('Financial Anomaly Engine', () => {
  const engine = new FinancialAnomalyEngine();

  const createStmt = (overrides: Partial<FinancialStatement> = {}): FinancialStatement => ({
    period: '2024-Q1',
    revenue: 1e9,
    grossProfit: 4e8,
    operatingProfit: 2e8,
    netIncome: 1.5e8,
    totalAssets: 5e9,
    totalLiabilities: 2e9,
    currentAssets: 2e9,
    currentLiabilities: 1e9,
    retainedEarnings: 1e9,
    ebit: 2.5e8,
    marketCap: 1e10,
    sharesOutstanding: 1e9,
    operatingCashFlow: 2e8,
    investingCashFlow: -5e7,
    financingCashFlow: -3e7,
    accountsReceivable: 3e8,
    inventory: 2e8,
    totalEquity: 3e9,
    ...overrides
  });

  describe('detectAnomalies', () => {
    it('should return empty for single statement', () => {
      const result = engine.detectAnomalies([createStmt()]);
      expect(result).toEqual([]);
    });

    it('should detect ROE surge', () => {
      const stmts = [
        createStmt({ period: '2023-Q4', netIncome: 1e8, totalEquity: 3e9 }),
        createStmt({ period: '2024-Q1', netIncome: 8e8, totalEquity: 3e9 }),
      ];
      const anomalies = engine.detectAnomalies(stmts);
      expect(anomalies.some(a => a.type === 'roe_surge')).toBe(true);
    });

    it('should detect ROE plunge', () => {
      const stmts = [
        createStmt({ period: '2023-Q4', netIncome: 5e8, totalEquity: 3e9 }),
        createStmt({ period: '2024-Q1', netIncome: 1e7, totalEquity: 3e9 }),
      ];
      const anomalies = engine.detectAnomalies(stmts);
      expect(anomalies.some(a => a.type === 'roe_plunge')).toBe(true);
    });

    it('should detect revenue anomaly', () => {
      const stmts = [
        createStmt({ period: '2023-Q4', revenue: 1e9 }),
        createStmt({ period: '2024-Q1', revenue: 3e9 }),
      ];
      const anomalies = engine.detectAnomalies(stmts);
      expect(anomalies.some(a => a.type === 'revenue_anomaly')).toBe(true);
    });

    it('should detect margin anomaly', () => {
      const stmts = [
        createStmt({ period: '2023-Q4', grossProfit: 4e8, revenue: 1e9 }),
        createStmt({ period: '2024-Q1', grossProfit: 2e8, revenue: 1e9 }),
      ];
      const anomalies = engine.detectAnomalies(stmts);
      expect(anomalies.some(a => a.type === 'margin_anomaly')).toBe(true);
    });

    it('should detect cash flow mismatch', () => {
      const stmts = [
        createStmt({ period: '2023-Q4', netIncome: 1e8, operatingCashFlow: 2e8 }),
        createStmt({ period: '2024-Q1', netIncome: 1e8, operatingCashFlow: -5e7 }),
      ];
      const anomalies = engine.detectAnomalies(stmts);
      expect(anomalies.some(a => a.type === 'cash_flow_mismatch')).toBe(true);
    });

    it('should include severity levels', () => {
      const stmts = [
        createStmt({ period: '2023-Q4', revenue: 1e9 }),
        createStmt({ period: '2024-Q1', revenue: 5e9 }), // 5x increase
      ];
      const anomalies = engine.detectAnomalies(stmts);
      const revenueAnomaly = anomalies.find(a => a.type === 'revenue_anomaly');
      expect(revenueAnomaly).toBeDefined();
      expect(revenueAnomaly!.severity).toBe('high');
    });

    it('should sort statements by period', () => {
      const stmts = [
        createStmt({ period: '2024-Q1', netIncome: 1e8, totalEquity: 3e9 }),
        createStmt({ period: '2023-Q4', netIncome: 5e8, totalEquity: 3e9 }),
      ];
      // Should not throw, handles unsorted
      const anomalies = engine.detectAnomalies(stmts);
      expect(Array.isArray(anomalies)).toBe(true);
    });
  });

  describe('calculateAltmanZScore', () => {
    it('should calculate Z-score for healthy company', () => {
      const stmt = createStmt({
        currentAssets: 3e9, currentLiabilities: 1e9,
        retainedEarnings: 2e9, ebit: 5e8,
        marketCap: 2e10, totalLiabilities: 1e9,
        totalAssets: 5e9, revenue: 3e9
      });
      const result = engine.calculateAltmanZScore(stmt);
      expect(result.score).toBeGreaterThan(2.99);
      expect(result.zone).toBe('safe');
    });

    it('should detect distress zone', () => {
      const stmt = createStmt({
        currentAssets: 5e8, currentLiabilities: 2e9,
        retainedEarnings: -1e9, ebit: -2e8,
        marketCap: 5e8, totalLiabilities: 5e9,
        totalAssets: 5.5e9, revenue: 1e8
      });
      const result = engine.calculateAltmanZScore(stmt);
      expect(result.zone).toBe('distress');
    });

    it('should include all components', () => {
      const stmt = createStmt();
      const result = engine.calculateAltmanZScore(stmt);
      expect(result.components.workingCapitalToAssets).toBeTypeOf('number');
      expect(result.components.retainedEarningsToAssets).toBeTypeOf('number');
      expect(result.components.ebitToAssets).toBeTypeOf('number');
      expect(result.components.marketCapToLiabilities).toBeTypeOf('number');
      expect(result.components.assetTurnover).toBeTypeOf('number');
    });

    it('should handle zero liabilities', () => {
      const stmt = createStmt({ totalLiabilities: 0 });
      const result = engine.calculateAltmanZScore(stmt);
      expect(isFinite(result.score)).toBe(true);
    });
  });

  describe('evaluateCashFlowQuality', () => {
    it('should evaluate excellent cash flow', () => {
      const stmt = createStmt({
        operatingCashFlow: 3e8, netIncome: 1.5e8,
        investingCashFlow: -3e7, revenue: 1e9, marketCap: 1e10
      });
      const result = engine.evaluateCashFlowQuality(stmt);
      expect(result.score).toBeGreaterThan(50);
    });

    it('should evaluate poor cash flow', () => {
      const stmt = createStmt({
        operatingCashFlow: -1e8, netIncome: 1.5e8,
        investingCashFlow: -2e8, revenue: 1e9, marketCap: 1e10
      });
      const result = engine.evaluateCashFlowQuality(stmt);
      expect(result.score).toBeLessThan(50);
    });

    it('should have quality label', () => {
      const stmt = createStmt();
      const result = engine.evaluateCashFlowQuality(stmt);
      expect(['excellent', 'good', 'fair', 'poor']).toContain(result.quality);
    });

    it('should calculate OCF to net income ratio', () => {
      const stmt = createStmt({ operatingCashFlow: 2e8, netIncome: 1e8 });
      const result = engine.evaluateCashFlowQuality(stmt);
      expect(result.operatingToNetIncome).toBeCloseTo(2, 0);
    });

    it('should handle zero net income', () => {
      const stmt = createStmt({ netIncome: 0, operatingCashFlow: 1e8 });
      const result = engine.evaluateCashFlowQuality(stmt);
      expect(isFinite(result.operatingToNetIncome)).toBe(true);
    });
  });

  describe('detectEarningsManipulation', () => {
    it('should return low risk for normal company', () => {
      const stmts = [
        createStmt({ period: '2023-Q4' }),
        createStmt({ period: '2024-Q1' }),
      ];
      const result = engine.detectEarningsManipulation(stmts);
      expect(result.riskLevel).toBe('low');
    });

    it('should detect AR buildup', () => {
      const stmts = [
        createStmt({ period: '2023-Q4', accountsReceivable: 1e8, revenue: 1e9 }),
        createStmt({ period: '2024-Q1', accountsReceivable: 8e8, revenue: 1.1e9 }),
      ];
      const result = engine.detectEarningsManipulation(stmts);
      expect(result.flags.some(f => f.includes('应收'))).toBe(true);
    });

    it('should detect cash flow mismatch as manipulation sign', () => {
      const stmts = [
        createStmt({ period: '2023-Q4', netIncome: 1e8, operatingCashFlow: 2e8 }),
        createStmt({ period: '2024-Q1', netIncome: 5e8, operatingCashFlow: 1e7 }),
      ];
      const result = engine.detectEarningsManipulation(stmts);
      expect(result.flags.length).toBeGreaterThan(0);
    });

    it('should return empty flags for single statement', () => {
      const result = engine.detectEarningsManipulation([createStmt()]);
      expect(result.flags).toEqual([]);
      expect(result.riskLevel).toBe('low');
    });

    it('should calculate Beneish M-Score', () => {
      const stmts = [
        createStmt({ period: '2023-Q4' }),
        createStmt({ period: '2024-Q1' }),
      ];
      const result = engine.detectEarningsManipulation(stmts);
      expect(result.beneishMScore).toBeTypeOf('number');
      expect(isFinite(result.beneishMScore)).toBe(true);
    });

    it('should have score between 0 and 100', () => {
      const stmts = [
        createStmt({ period: '2023-Q4' }),
        createStmt({ period: '2024-Q1', accountsReceivable: 9e8, netIncome: 1e8, operatingCashFlow: -1e7 }),
      ];
      const result = engine.detectEarningsManipulation(stmts);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateHealthScore', () => {
    it('should give high score to healthy company', () => {
      const stmt = createStmt({
        revenue: 3e9, netIncome: 5e8, totalAssets: 5e9,
        totalLiabilities: 1e9, currentAssets: 3e9, currentLiabilities: 1e9,
        totalEquity: 4e9, operatingCashFlow: 6e8
      });
      const result = engine.calculateHealthScore(stmt);
      expect(result.overall).toBeGreaterThan(50);
    });

    it('should give low score to unhealthy company', () => {
      const stmt = createStmt({
        revenue: 1e8, netIncome: -5e8, totalAssets: 5e9,
        totalLiabilities: 4.5e9, currentAssets: 5e8, currentLiabilities: 2e9,
        totalEquity: 5e8, operatingCashFlow: -2e8
      });
      const result = engine.calculateHealthScore(stmt);
      expect(result.overall).toBeLessThan(50);
    });

    it('should include all dimensions', () => {
      const stmt = createStmt();
      const result = engine.calculateHealthScore(stmt);
      expect(result.profitability).toBeTypeOf('number');
      expect(result.liquidity).toBeTypeOf('number');
      expect(result.solvency).toBeTypeOf('number');
      expect(result.efficiency).toBeTypeOf('number');
      expect(result.growth).toBeTypeOf('number');
      expect(result.quality).toBeTypeOf('number');
    });

    it('should assign grades', () => {
      const stmt = createStmt();
      const result = engine.calculateHealthScore(stmt);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
    });

    it('should calculate growth when prev is provided', () => {
      const prev = createStmt({ period: '2023-Q4', revenue: 1e9 });
      const curr = createStmt({ period: '2024-Q1', revenue: 1.2e9 });
      const result = engine.calculateHealthScore(curr, prev);
      expect(result.growth).toBeGreaterThan(50);
    });
  });

  describe('edge cases', () => {
    it('should handle zero assets', () => {
      const stmt = createStmt({ totalAssets: 0 });
      const result = engine.calculateHealthScore(stmt);
      expect(isFinite(result.overall)).toBe(true);
    });

    it('should handle negative equity', () => {
      const stmt = createStmt({ totalEquity: -1e9, netIncome: -2e8 });
      const result = engine.calculateHealthScore(stmt);
      expect(isFinite(result.overall)).toBe(true);
    });

    it('should handle all zeros', () => {
      const stmt = createStmt({
        revenue: 0, grossProfit: 0, operatingProfit: 0, netIncome: 0,
        totalAssets: 1, totalLiabilities: 0, currentAssets: 0, currentLiabilities: 0,
        retainedEarnings: 0, ebit: 0, marketCap: 1, operatingCashFlow: 0,
        investingCashFlow: 0, financingCashFlow: 0, accountsReceivable: 0,
        inventory: 0, totalEquity: 1
      });
      const result = engine.calculateHealthScore(stmt);
      expect(isFinite(result.overall)).toBe(true);
    });
  });
});
