import { describe, it, expect, beforeEach } from 'vitest';
import { EarningsSurpriseEngine } from '../services/earningsSurpriseEngine';
import type { FinancialReport, AnalystEstimate } from '../services/earningsSurpriseEngine';

describe('EarningsSurpriseEngine', () => {
  let engine: EarningsSurpriseEngine;

  const createReport = (overrides: Partial<FinancialReport> = {}): FinancialReport => ({
    symbol: '000001',
    period: '2024-Q3',
    revenue: 1000000,
    netIncome: 200000,
    grossProfit: 500000,
    operatingCashFlow: 250000,
    totalAssets: 5000000,
    totalLiabilities: 3000000,
    eps: 1.5,
    roe: 0.15,
    grossMargin: 0.5,
    netMargin: 0.2,
    debtToAsset: 0.6,
    currentRatio: 1.5,
    ...overrides,
  });

  const createEstimate = (overrides: Partial<AnalystEstimate> = {}): AnalystEstimate => ({
    symbol: '000001',
    period: '2024-Q3',
    expectedEps: 1.5,
    expectedRevenue: 1000000,
    expectedGrowth: 0.1,
    analystCount: 10,
    ...overrides,
  });

  beforeEach(() => {
    engine = new EarningsSurpriseEngine();
  });

  describe('EPS预期偏离检测', () => {
    it('应该检测正向超预期', () => {
      const report = createReport({ eps: 2.0 });
      const estimate = createEstimate({ expectedEps: 1.5 });

      const result = engine.detectEpsSurprise(report, estimate);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('above');
      expect(result!.value).toBeGreaterThan(0.15);
    });

    it('应该检测负向低于预期', () => {
      const report = createReport({ eps: 1.0 });
      const estimate = createEstimate({ expectedEps: 1.5 });

      const result = engine.detectEpsSurprise(report, estimate);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('below');
    });

    it('应该忽略微小偏离', () => {
      const report = createReport({ eps: 1.52 });
      const estimate = createEstimate({ expectedEps: 1.5 });

      const result = engine.detectEpsSurprise(report, estimate);
      expect(result).toBeNull();
    });

    it('应该处理零预期', () => {
      const report = createReport({ eps: 0.5 });
      const estimate = createEstimate({ expectedEps: 0 });

      const result = engine.detectEpsSurprise(report, estimate);
      expect(result).toBeNull();
    });
  });

  describe('营收增速检测', () => {
    it('应该检测高增长', () => {
      const prev = createReport({ revenue: 1000000 });
      const curr = createReport({ revenue: 1500000 });

      const result = engine.detectRevenueAnomaly(curr, prev);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('above');
      expect(result!.value).toBeCloseTo(0.5, 1);
    });

    it('应该检测营收下滑', () => {
      const prev = createReport({ revenue: 1000000 });
      const curr = createReport({ revenue: 700000 });

      const result = engine.detectRevenueAnomaly(curr, prev);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('below');
    });

    it('应该忽略小幅变化', () => {
      const prev = createReport({ revenue: 1000000 });
      const curr = createReport({ revenue: 1020000 });

      const result = engine.detectRevenueAnomaly(curr, prev);
      expect(result).toBeNull();
    });

    it('应该处理零营收', () => {
      const prev = createReport({ revenue: 0 });
      const curr = createReport({ revenue: 1000000 });

      const result = engine.detectRevenueAnomaly(curr, prev);
      expect(result).toBeNull();
    });
  });

  describe('毛利率检测', () => {
    it('应该检测毛利率提升', () => {
      const prev = createReport({ grossMargin: 0.4 });
      const curr = createReport({ grossMargin: 0.5 });

      const result = engine.detectMarginAnomaly(curr, prev);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('above');
    });

    it('应该检测毛利率下降', () => {
      const prev = createReport({ grossMargin: 0.5 });
      const curr = createReport({ grossMargin: 0.35 });

      const result = engine.detectMarginAnomaly(curr, prev);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('below');
    });
  });

  describe('现金流检测', () => {
    it('应该检测正向背离', () => {
      const report = createReport({
        netIncome: 200000,
        operatingCashFlow: 400000,
      });

      const result = engine.detectCashFlowMismatch(report);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('above');
    });

    it('应该检测负向背离', () => {
      const report = createReport({
        netIncome: 200000,
        operatingCashFlow: 80000,
      });

      const result = engine.detectCashFlowMismatch(report);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('below');
    });

    it('应该忽略正常的现金流/利润比', () => {
      const report = createReport({
        netIncome: 200000,
        operatingCashFlow: 210000,
      });

      const result = engine.detectCashFlowMismatch(report);
      expect(result).toBeNull();
    });
  });

  describe('杠杆检测', () => {
    it('应该检测资产负债率上升', () => {
      const prev = createReport({ debtToAsset: 0.5 });
      const curr = createReport({ debtToAsset: 0.7 });

      const result = engine.detectLeverageAnomaly(curr, prev);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('above');
    });
  });

  describe('综合分析', () => {
    it('应该给出正面评价', () => {
      const prev = createReport({ revenue: 1000000, grossMargin: 0.4 });
      const curr = createReport({
        revenue: 1500000,
        grossMargin: 0.55,
        operatingCashFlow: 300000,
        eps: 2.0,
      });
      const estimate = createEstimate({ expectedEps: 1.5 });

      const result = engine.analyze(curr, prev, estimate);
      expect(result.type).toBe('positive');
      expect(result.score).toBeGreaterThan(0);
      expect(result.signals.length).toBeGreaterThan(0);
      expect(result.recommendation).toBeTruthy();
    });

    it('应该给出负面评价', () => {
      const prev = createReport({ revenue: 1000000, grossMargin: 0.5 });
      const curr = createReport({
        revenue: 600000,
        grossMargin: 0.3,
        operatingCashFlow: 50000,
        eps: 0.8,
        debtToAsset: 0.8,
      });
      const estimate = createEstimate({ expectedEps: 1.5 });

      const result = engine.analyze(curr, prev, estimate);
      expect(result.type).toBe('negative');
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('应该给出中性评价', () => {
      const prev = createReport();
      const curr = createReport();

      const result = engine.analyze(curr, prev);
      expect(result.type).toBe('neutral');
    });

    it('应该包含时间戳', () => {
      const prev = createReport();
      const curr = createReport();

      const result = engine.analyze(curr, prev);
      expect(result.timestamp).toBeGreaterThan(0);
    });
  });

  describe('批量分析', () => {
    it('应该批量处理多只股票', () => {
      const reports = new Map([
        ['000001', {
          current: createReport({ symbol: '000001', revenue: 1500000 }),
          previous: createReport({ symbol: '000001', revenue: 1000000 }),
        }],
        ['000002', {
          current: createReport({ symbol: '000002', revenue: 800000 }),
          previous: createReport({ symbol: '000002', revenue: 1000000 }),
        }],
      ]);

      const results = engine.batchAnalyze(reports);
      expect(results).toHaveLength(2);
    });
  });

  describe('阈值配置', () => {
    it('应该支持自定义阈值', () => {
      engine.updateThresholds({
        revenueGrowth: { low: 0.1, medium: 0.2, high: 0.4 },
      });

      const prev = createReport({ revenue: 1000000 });
      const curr = createReport({ revenue: 1150000 });

      // 15%增长，新阈值下是 low 而非 medium
      const result = engine.detectRevenueAnomaly(curr, prev);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('low');
    });
  });
});
