import { describe, it, expect } from 'vitest';
import {
  brinsonAttribution,
  brinsonAttributionImproved,
  riskAttribution,
  multiFactorAttribution,
  calculatePerformanceSummary,
  type SectorHolding,
} from '../utils/portfolioAttributionEngine';

const mockSectorHoldings: SectorHolding[] = [
  { sector: '科技', portfolioWeight: 0.4, benchmarkWeight: 0.3, portfolioReturn: 0.08, benchmarkReturn: 0.05 },
  { sector: '金融', portfolioWeight: 0.3, benchmarkWeight: 0.4, portfolioReturn: 0.03, benchmarkReturn: 0.04 },
  { sector: '消费', portfolioWeight: 0.3, benchmarkWeight: 0.3, portfolioReturn: 0.06, benchmarkReturn: 0.04 },
];

describe('组合归因引擎', () => {
  describe('brinsonAttribution', () => {
    it('should decompose active return', () => {
      const result = brinsonAttribution(mockSectorHoldings);
      expect(typeof result.allocationEffect).toBe('number');
      expect(typeof result.selectionEffect).toBe('number');
      expect(typeof result.interactionEffect).toBe('number');
      expect(typeof result.totalActiveReturn).toBe('number');
    });

    it('should attribute by sector', () => {
      const result = brinsonAttribution(mockSectorHoldings);
      expect(result.attributionBySector.length).toBe(3);
      result.attributionBySector.forEach(s => {
        expect(s.sector).toBeTruthy();
        expect(typeof s.allocation).toBe('number');
        expect(typeof s.selection).toBe('number');
      });
    });

    it('should sum to total active return', () => {
      const result = brinsonAttribution(mockSectorHoldings);
      const sum = result.allocationEffect + result.selectionEffect + result.interactionEffect;
      expect(sum).toBeCloseTo(result.totalActiveReturn, 4);
    });

    it('should handle single sector', () => {
      const single: SectorHolding[] = [
        { sector: '科技', portfolioWeight: 1, benchmarkWeight: 1, portfolioReturn: 0.05, benchmarkReturn: 0.04 },
      ];
      const result = brinsonAttribution(single);
      expect(result.totalActiveReturn).toBeCloseTo(0.01, 4);
    });
  });

  describe('brinsonAttributionImproved', () => {
    it('should allocate interaction equally', () => {
      const result = brinsonAttributionImproved(mockSectorHoldings);
      expect(result.allocation + result.selection).toBeCloseTo(result.total, 4);
    });

    it('should match total with basic Brinson', () => {
      const basic = brinsonAttribution(mockSectorHoldings);
      const improved = brinsonAttributionImproved(mockSectorHoldings);
      expect(improved.total).toBeCloseTo(basic.totalActiveReturn, 4);
    });
  });

  describe('riskAttribution', () => {
    it('should calculate total risk', () => {
      const cov = [
        [0.04, 0.01, 0.02],
        [0.01, 0.09, 0.015],
        [0.02, 0.015, 0.06],
      ];
      const loadings = [
        [0.8, 0.3],
        [0.5, 0.7],
        [0.6, 0.4],
      ];
      const result = riskAttribution([0.4, 0.3, 0.3], cov, loadings, ['market', 'size']);
      expect(result.totalRisk).toBeGreaterThan(0);
      expect(result.systematicRisk).toBeGreaterThanOrEqual(0);
      expect(result.factorContributions.length).toBe(2);
    });

    it('should have consistent risk decomposition', () => {
      const cov = [[0.04, 0.01], [0.01, 0.09]];
      const loadings = [[0.8, 0.3], [0.5, 0.7]];
      const result = riskAttribution([0.5, 0.5], cov, loadings, ['mkt', 'size']);
      expect(result.totalRisk).toBeGreaterThan(0);
      expect(result.factorContributions.length).toBe(2);
      expect(result.factorContributions.some(f => f.percentage > 0)).toBe(true);
    });
  });

  describe('multiFactorAttribution', () => {
    it('should calculate factor contributions', () => {
      const portRet = [0.01, 0.02, -0.01, 0.015, 0.005, 0.03, -0.02, 0.01, 0.02, 0.015,
                       0.01, 0.02, -0.01, 0.015, 0.005, 0.03, -0.02, 0.01, 0.02, 0.015];
      const benchRet = [0.008, 0.015, -0.005, 0.012, 0.003, 0.025, -0.015, 0.008, 0.018, 0.012,
                        0.008, 0.015, -0.005, 0.012, 0.003, 0.025, -0.015, 0.008, 0.018, 0.012];
      const factorRet = portRet.map((_, i) => [
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.01,
      ]);
      const result = multiFactorAttribution(portRet, benchRet, factorRet, ['market', 'size']);
      expect(result.factors.length).toBe(2);
      expect(typeof result.specificReturn).toBe('number');
      expect(typeof result.rSquared).toBe('number');
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.rSquared).toBeLessThanOrEqual(1);
    });

    it('should handle insufficient data', () => {
      const result = multiFactorAttribution([0.01], [0.008], [[0.005]], ['market']);
      expect(result.factors.length).toBe(1);
    });
  });

  describe('calculatePerformanceSummary', () => {
    const portReturns = Array.from({ length: 252 }, () => (Math.random() - 0.48) * 0.03);
    const benchReturns = Array.from({ length: 252 }, () => (Math.random() - 0.5) * 0.02);

    it('should calculate all metrics', () => {
      const summary = calculatePerformanceSummary(portReturns, benchReturns);
      expect(typeof summary.portfolioReturn).toBe('number');
      expect(typeof summary.sharpeRatio).toBe('number');
      expect(typeof summary.maxDrawdown).toBe('number');
      expect(summary.winRate).toBeGreaterThanOrEqual(0);
      expect(summary.winRate).toBeLessThanOrEqual(100);
    });

    it('should have tracking error >= 0', () => {
      const summary = calculatePerformanceSummary(portReturns, benchReturns);
      expect(summary.trackingError).toBeGreaterThanOrEqual(0);
    });

    it('should calculate Sortino ratio', () => {
      const summary = calculatePerformanceSummary(portReturns, benchReturns);
      expect(typeof summary.sortinoRatio).toBe('number');
    });

    it('should handle empty returns', () => {
      const summary = calculatePerformanceSummary([], []);
      expect(summary.portfolioReturn).toBe(0);
      expect(summary.sharpeRatio).toBe(0);
    });

    it('should have max drawdown <= 0', () => {
      const summary = calculatePerformanceSummary(portReturns, benchReturns);
      expect(summary.maxDrawdown).toBeLessThanOrEqual(0);
    });

    it('should calculate profit factor', () => {
      const summary = calculatePerformanceSummary(portReturns, benchReturns);
      expect(summary.profitFactor).toBeGreaterThanOrEqual(0);
    });

    it('should have Calmar ratio', () => {
      const summary = calculatePerformanceSummary(portReturns, benchReturns);
      expect(typeof summary.calmarRatio).toBe('number');
    });
  });
});
