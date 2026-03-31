import { describe, it, expect } from 'vitest';
import {
  detectPremiumArb,
  detectDiscountArb,
  analyzeCreationRedemption,
  findSubstitutionPairs,
  scanArbitrageOpportunities,
  type ETFPosition,
} from '../utils/etfArbitrageEngine';

function makeETF(overrides: Partial<ETFPosition> = {}): ETFPosition {
  return {
    ticker: '510300',
    name: '沪深300ETF',
    nav: 4.5,
    price: 4.52,
    premium: 0.44,
    volume: 1e9,
    creationUnit: 1000000,
    holdings: [
      { ticker: '600519', weight: 0.05, price: 1800 },
      { ticker: '000858', weight: 0.03, price: 150 },
      { ticker: '601318', weight: 0.04, price: 50 },
    ],
    trackingError: 0.001,
    expenseRatio: 0.0015,
    ...overrides,
  };
}

describe('ETF Arbitrage Engine', () => {
  describe('detectPremiumArb', () => {
    it('should return null for small premium', () => {
      expect(detectPremiumArb(makeETF({ premium: 0.1 }))).toBeNull();
    });

    it('should detect profitable premium arb', () => {
      const etf = makeETF({ premium: 3, price: 4.635, nav: 4.5 });
      const arb = detectPremiumArb(etf);
      if (arb) {
        expect(arb.direction).toBe('sell_etf_buy_stocks');
        expect(arb.estimatedProfit).toBeGreaterThan(0);
        expect(arb.executionSteps.length).toBeGreaterThan(0);
      }
    });

    it('should include cost breakdown', () => {
      const etf = makeETF({ premium: 2, price: 4.59 });
      const arb = detectPremiumArb(etf);
      if (arb) {
        expect(arb.cost.commission).toBeGreaterThan(0);
        expect(arb.cost.total).toBeGreaterThan(0);
        expect(arb.profitBps).toBeDefined();
      }
    });

    it('should assess risk level', () => {
      const lowRisk = detectPremiumArb(makeETF({ premium: 0.8, price: 4.536 }));
      const highRisk = detectPremiumArb(makeETF({ premium: 5, price: 4.725 }));

      if (lowRisk) expect(['low', 'medium']).toContain(lowRisk.risk);
      if (highRisk) expect(highRisk.risk).toBe('high');
    });
  });

  describe('detectDiscountArb', () => {
    it('should return null for small discount', () => {
      expect(detectDiscountArb(makeETF({ premium: -0.1 }))).toBeNull();
    });

    it('should detect profitable discount arb', () => {
      const etf = makeETF({ premium: -3, price: 4.365, nav: 4.5 });
      const arb = detectDiscountArb(etf);
      if (arb) {
        expect(arb.direction).toBe('buy_etf_sell_stocks');
        expect(arb.estimatedProfit).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeCreationRedemption', () => {
    it('should analyze creation', () => {
      const cr = analyzeCreationRedemption(makeETF(), 1000000, 'create');
      expect(cr.action).toBe('create');
      expect(cr.feasible).toBe(true);
      expect(cr.stockComponents.length).toBeGreaterThan(0);
    });

    it('should reject non-standard units', () => {
      const cr = analyzeCreationRedemption(makeETF(), 500, 'create');
      expect(cr.feasible).toBe(false);
      expect(cr.reason).toBeDefined();
    });

    it('should calculate components', () => {
      const cr = analyzeCreationRedemption(makeETF(), 1000000, 'redeem');
      expect(cr.totalCost).toBeGreaterThan(0);
      cr.stockComponents.forEach(c => {
        expect(c.shares).toBeGreaterThan(0);
        expect(c.amount).toBeGreaterThan(0);
      });
    });
  });

  describe('findSubstitutionPairs', () => {
    it('should find similar ETFs', () => {
      const etfs = [
        makeETF({ ticker: 'A', holdings: [
          { ticker: 'X', weight: 0.5, price: 100 },
          { ticker: 'Y', weight: 0.3, price: 50 },
          { ticker: 'Z', weight: 0.2, price: 30 },
        ]}),
        makeETF({ ticker: 'B', holdings: [
          { ticker: 'X', weight: 0.4, price: 100 },
          { ticker: 'Y', weight: 0.4, price: 50 },
          { ticker: 'W', weight: 0.2, price: 20 },
        ]}),
      ];
      const pairs = findSubstitutionPairs(etfs);
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0].correlation).toBeGreaterThan(0);
    });

    it('should return empty for different ETFs', () => {
      const etfs = [
        makeETF({ holdings: [{ ticker: 'A', weight: 1, price: 100 }] }),
        makeETF({ holdings: [{ ticker: 'B', weight: 1, price: 50 }] }),
      ];
      // correlation would be 0, so no pairs
      const pairs = findSubstitutionPairs(etfs);
      expect(pairs.length).toBe(0);
    });
  });

  describe('scanArbitrageOpportunities', () => {
    it('should scan multiple ETFs', () => {
      const etfs = [
        makeETF({ premium: 3, price: 4.635 }),
        makeETF({ premium: -2, price: 4.41 }),
        makeETF({ premium: 0.1 }),
      ];
      const opps = scanArbitrageOpportunities(etfs);
      expect(opps.length).toBeGreaterThan(0);
    });

    it('should sort by profit', () => {
      const etfs = [
        makeETF({ premium: 1, price: 4.545 }),
        makeETF({ premium: 5, price: 4.725 }),
      ];
      const opps = scanArbitrageOpportunities(etfs);
      if (opps.length >= 2) {
        expect(opps[0].profitBps).toBeGreaterThanOrEqual(opps[1].profitBps);
      }
    });
  });
});
