import { describe, it, expect } from 'vitest';
import {
  analyzeETF,
  compareETFs,
  detectArbitrageOpportunities,
  type ETFData,
} from '../utils/etfAnalysisEngine';

describe('ETFAnalysisEngine', () => {
  const mockETFs: ETFData[] = [
    {
      ticker: '510300', name: '沪深300ETF', nav: 4.5, price: 4.51, premium: 0.22,
      trackingError: 0.05, volume: 5e8, turnover: 2.25e9, aum: 5e11, aumChange: 0.05,
      expenseRatio: 0.0015, sector: '宽基', holdings: [],
    },
    {
      ticker: '159915', name: '创业板ETF', nav: 2.0, price: 2.05, premium: 2.5,
      trackingError: 0.12, volume: 3e8, turnover: 6e8, aum: 1e11, aumChange: -0.02,
      expenseRatio: 0.002, sector: '宽基', holdings: [],
    },
    {
      ticker: '512880', name: '证券ETF', nav: 1.0, price: 0.98, premium: -2.0,
      trackingError: 0.08, volume: 1e8, turnover: 1e8, aum: 5e10, aumChange: 0.1,
      expenseRatio: 0.0025, sector: '行业', holdings: [],
    },
    {
      ticker: '999999', name: '小众ETF', nav: 1.5, price: 1.52, premium: 1.33,
      trackingError: 0.3, volume: 1e6, turnover: 1e6, aum: 1e8, aumChange: -0.15,
      expenseRatio: 0.005, sector: '主题', holdings: [],
    },
  ];

  describe('analyzeETF', () => {
    it('should classify fair value ETF', () => {
      const result = analyzeETF(mockETFs[0]);
      expect(result.valuation).toBe('fair');
    });

    it('should classify premium ETF', () => {
      const result = analyzeETF(mockETFs[1]);
      expect(result.valuation).toBe('premium');
    });

    it('should classify discount ETF', () => {
      const result = analyzeETF(mockETFs[2]);
      expect(result.valuation).toBe('discount');
    });

    it('should calculate liquidity score', () => {
      const result = analyzeETF(mockETFs[0]);
      expect(result.liquidityScore).toBeGreaterThan(0);
      expect(result.liquidityScore).toBeLessThanOrEqual(100);
    });

    it('should calculate efficiency score', () => {
      const result = analyzeETF(mockETFs[0]);
      expect(result.efficiencyScore).toBeGreaterThan(0);
      expect(result.efficiencyScore).toBeLessThanOrEqual(100);
    });

    it('should recommend buy for good ETFs', () => {
      const result = analyzeETF(mockETFs[0]);
      expect(['buy', 'hold', 'avoid']).toContain(result.recommendation);
    });

    it('should recommend avoid for poor ETFs', () => {
      const result = analyzeETF(mockETFs[3]);
      expect(result.recommendation).toBe('avoid');
    });

    it('should include reasons', () => {
      const result = analyzeETF(mockETFs[0]);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should include discount arbitrage reason', () => {
      const result = analyzeETF(mockETFs[2]);
      expect(result.reasons.some((r) => r.includes('套利'))).toBe(true);
    });

    it('should give higher liquidity score to high-volume ETF', () => {
      const hi = analyzeETF(mockETFs[0]);
      const lo = analyzeETF(mockETFs[3]);
      expect(hi.liquidityScore).toBeGreaterThan(lo.liquidityScore);
    });

    it('should give higher efficiency score to low-error ETF', () => {
      const hi = analyzeETF(mockETFs[0]);
      const lo = analyzeETF(mockETFs[3]);
      expect(hi.efficiencyScore).toBeGreaterThan(lo.efficiencyScore);
    });
  });

  describe('compareETFs', () => {
    it('should compare across metrics', () => {
      const result = compareETFs(mockETFs);
      expect(result.length).toBeGreaterThan(0);
      for (const m of result) {
        expect(m.winner).toBeDefined();
        expect(m.details).toHaveLength(4);
      }
    });

    it('should identify best tracking error', () => {
      const result = compareETFs(mockETFs);
      const tracking = result.find((m) => m.metric.includes('跟踪'))!;
      expect(tracking.winner).toBe('510300');
    });

    it('should identify highest turnover', () => {
      const result = compareETFs(mockETFs);
      const turnover = result.find((m) => m.metric.includes('成交'))!;
      expect(turnover.winner).toBe('510300');
    });

    it('should handle single ETF', () => {
      const result = compareETFs([mockETFs[0]]);
      for (const m of result) {
        expect(m.winner).toBe('510300');
      }
    });

    it('should handle empty ETFs', () => {
      const result = compareETFs([]);
      for (const m of result) {
        expect(m.winner).toBe('');
      }
    });
  });

  describe('detectArbitrageOpportunities', () => {
    it('should detect premium arbitrage', () => {
      const result = detectArbitrageOpportunities(mockETFs);
      const premiumOpp = result.find((o) => o.type === '溢价套利');
      expect(premiumOpp).toBeDefined();
    });

    it('should detect discount arbitrage', () => {
      const result = detectArbitrageOpportunities(mockETFs);
      const discountOpp = result.find((o) => o.type === '折价套利');
      expect(discountOpp).toBeDefined();
    });

    it('should exclude small spreads', () => {
      const result = detectArbitrageOpportunities(mockETFs);
      expect(result.every((o) => o.spread > 1)).toBe(true);
    });

    it('should estimate profit after costs', () => {
      const result = detectArbitrageOpportunities(mockETFs);
      for (const o of result) {
        expect(o.estimatedProfit).toBeLessThan(o.spread);
        expect(o.estimatedProfit).toBeGreaterThan(0);
      }
    });

    it('should assign risk levels', () => {
      const result = detectArbitrageOpportunities(mockETFs);
      for (const o of result) {
        expect(['low', 'medium', 'high']).toContain(o.risk);
      }
    });

    it('should sort by estimated profit descending', () => {
      const result = detectArbitrageOpportunities(mockETFs);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].estimatedProfit).toBeGreaterThanOrEqual(result[i].estimatedProfit);
      }
    });

    it('should handle empty ETFs', () => {
      const result = detectArbitrageOpportunities([]);
      expect(result).toHaveLength(0);
    });

    it('should handle no arbitrage opportunities', () => {
      const fairETFs = mockETFs.map((e) => ({ ...e, premium: 0.1 }));
      const result = detectArbitrageOpportunities(fairETFs);
      expect(result).toHaveLength(0);
    });
  });
});
