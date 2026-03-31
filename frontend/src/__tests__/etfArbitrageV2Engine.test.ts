import { describe, it, expect } from 'vitest';
import {
  calculatePremium,
  analyzeArbitrageOpportunity,
  monitorArbitrage,
  detectCrossMarketArb,
  type ETFQuote,
} from '../utils/etfArbitrageV2Engine';

const mockETF = (overrides: Partial<ETFQuote> = {}): ETFQuote => ({
  code: '510050',
  name: '上证50ETF',
  marketPrice: 3.05,
  nav: 3.00,
  iopv: 3.00,
  totalShares: 200000000,
  creationUnit: 1000000,
  updateTime: '2026-03-31T10:00:00',
  ...overrides,
});

describe('ETF套利引擎V2', () => {
  describe('calculatePremium', () => {
    it('should calculate premium correctly', () => {
      const result = calculatePremium(mockETF({ marketPrice: 3.06, iopv: 3.00 }));
      expect(result).toBeCloseTo(2, 1);
    });

    it('should calculate discount correctly', () => {
      const result = calculatePremium(mockETF({ marketPrice: 2.94, iopv: 3.00 }));
      expect(result).toBeCloseTo(-2, 1);
    });

    it('should return 0 for zero prices', () => {
      expect(calculatePremium(mockETF({ marketPrice: 0 }))).toBe(0);
    });
  });

  describe('analyzeArbitrageOpportunity', () => {
    it('should detect premium arbitrage', () => {
      const etf = mockETF({ marketPrice: 3.06, iopv: 3.00 }); // 2% premium
      const result = analyzeArbitrageOpportunity(etf);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('premium_arb');
    });

    it('should detect discount arbitrage', () => {
      const etf = mockETF({ marketPrice: 2.94, iopv: 3.00 }); // -2% discount
      const result = analyzeArbitrageOpportunity(etf);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('discount_arb');
    });

    it('should return null for small premium', () => {
      const etf = mockETF({ marketPrice: 3.005, iopv: 3.00 }); // 0.17% premium
      const result = analyzeArbitrageOpportunity(etf);
      expect(result).toBeNull();
    });

    it('should calculate net profit', () => {
      const etf = mockETF({ marketPrice: 3.10, iopv: 3.00 });
      const result = analyzeArbitrageOpportunity(etf);
      expect(result!.netProfit).toBeGreaterThan(0);
    });

    it('should include cost breakdown', () => {
      const etf = mockETF({ marketPrice: 3.10, iopv: 3.00 });
      const result = analyzeArbitrageOpportunity(etf);
      expect(result!.cost.commission).toBeGreaterThan(0);
      expect(result!.cost.slippage).toBeGreaterThan(0);
      expect(result!.cost.total).toBeGreaterThan(0);
    });

    it('should assess risk level', () => {
      const etf = mockETF({ marketPrice: 3.10, iopv: 3.00 });
      const result = analyzeArbitrageOpportunity(etf);
      expect(['low', 'medium', 'high']).toContain(result!.riskLevel);
    });

    it('should calculate feasibility', () => {
      const etf = mockETF({ marketPrice: 3.10, iopv: 3.00 });
      const result = analyzeArbitrageOpportunity(etf);
      expect(result!.feasibility).toBeGreaterThanOrEqual(0);
      expect(result!.feasibility).toBeLessThanOrEqual(100);
    });
  });

  describe('monitorArbitrage', () => {
    const etfs = [
      mockETF({ code: '510050', marketPrice: 3.06, iopv: 3.00 }),
      mockETF({ code: '159919', marketPrice: 4.50, iopv: 4.55 }),
      mockETF({ code: '510300', marketPrice: 5.00, iopv: 5.00 }),
    ];

    it('should find opportunities', () => {
      const result = monitorArbitrage(etfs);
      expect(result.opportunities.length).toBeGreaterThan(0);
    });

    it('should identify best opportunity', () => {
      const result = monitorArbitrage(etfs);
      expect(result.bestOpportunity).not.toBeNull();
    });

    it('should sort by net profit', () => {
      const result = monitorArbitrage(etfs);
      for (let i = 1; i < result.opportunities.length; i++) {
        expect(result.opportunities[i - 1].netProfit).toBeGreaterThanOrEqual(
          result.opportunities[i].netProfit
        );
      }
    });

    it('should calculate average premium', () => {
      const result = monitorArbitrage(etfs);
      expect(typeof result.avgPremium).toBe('number');
    });

    it('should handle empty ETFs', () => {
      const result = monitorArbitrage([]);
      expect(result.opportunities).toHaveLength(0);
      expect(result.bestOpportunity).toBeNull();
    });
  });

  describe('detectCrossMarketArb', () => {
    it('should detect cross-market opportunity', () => {
      const etf = mockETF({ marketPrice: 3.10 });
      const result = detectCrossMarketArb(etf, 3.00);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('cross_market');
    });

    it('should return null for small spread', () => {
      const etf = mockETF({ marketPrice: 3.01 });
      const result = detectCrossMarketArb(etf, 3.00);
      expect(result).toBeNull();
    });

    it('should calculate net profit', () => {
      const etf = mockETF({ marketPrice: 3.15 });
      const result = detectCrossMarketArb(etf, 3.00);
      expect(result!.netProfit).toBeGreaterThan(0);
    });

    it('should include time window', () => {
      const etf = mockETF({ marketPrice: 3.15 });
      const result = detectCrossMarketArb(etf, 3.00);
      expect(result!.timeWindow).toBe(30);
    });
  });
});
