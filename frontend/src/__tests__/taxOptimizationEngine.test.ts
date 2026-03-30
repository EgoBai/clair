import { describe, it, expect } from 'vitest';
import {
  calculateTradeCost,
  calculateRoundTripCost,
  calculateBreakevenPrice,
  calculateMinProfitableHolding,
  optimizeTaxLots,
  compareTaxMethods,
  calculateDividendTax,
  calculateOptimalDividendStrategy,
  calculateTotalTradingCost,
  estimateAnnualCostImpact,
  A_STOCK_FEES,
  type TaxLot,
} from '../utils/taxOptimizationEngine';

describe('calculateTradeCost', () => {
  it('should calculate buy costs correctly', () => {
    const cost = calculateTradeCost(100000, false);
    expect(cost.commission).toBeGreaterThanOrEqual(A_STOCK_FEES.minCommission);
    expect(cost.stampDuty).toBe(0); // 买入不收印花税
    expect(cost.total).toBeGreaterThan(0);
  });

  it('should calculate sell costs with stamp duty', () => {
    const cost = calculateTradeCost(100000, true);
    expect(cost.stampDuty).toBeCloseTo(100, 0); // 千分之一
    expect(cost.total).toBeGreaterThan(0);
  });

  it('sell should cost more than buy (stamp duty)', () => {
    const buy = calculateTradeCost(100000, false);
    const sell = calculateTradeCost(100000, true);
    expect(sell.total).toBeGreaterThan(buy.total);
  });

  it('should handle star/gem market', () => {
    const main = calculateTradeCost(100000, false, 'main');
    const star = calculateTradeCost(100000, false, 'star');
    // Star has no transfer fee
    expect(star.transferFee).toBe(0);
    expect(main.transferFee).toBeGreaterThan(0);
  });

  it('should use custom commission rate', () => {
    const defaultCost = calculateTradeCost(100000, false);
    const lowCost = calculateTradeCost(100000, false, 'main', 0.0001);
    expect(lowCost.commission).toBeLessThan(defaultCost.commission);
  });

  it('should enforce minimum commission', () => {
    const cost = calculateTradeCost(100, false); // Very small trade
    expect(cost.commission).toBe(A_STOCK_FEES.minCommission);
  });
});

describe('calculateRoundTripCost', () => {
  it('should calculate total round-trip cost', () => {
    const rt = calculateRoundTripCost(100000, 110000);
    expect(rt.totalCost).toBeGreaterThan(0);
    expect(rt.costPercent).toBeGreaterThan(0);
    expect(rt.costPercent).toBeLessThan(0.01); // Should be under 1%
  });

  it('should include buy and sell costs', () => {
    const rt = calculateRoundTripCost(100000, 100000);
    expect(rt.buyCost.total).toBeGreaterThan(0);
    expect(rt.sellCost.total).toBeGreaterThan(0);
    expect(rt.totalCost).toBe(rt.buyCost.total + rt.sellCost.total);
  });
});

describe('calculateBreakevenPrice', () => {
  it('should be higher than buy price', () => {
    const breakeven = calculateBreakevenPrice(10);
    expect(breakeven).toBeGreaterThan(10);
  });

  it('should be reasonable (within 10%)', () => {
    const breakeven = calculateBreakevenPrice(100000); // Use large amount to avoid min commission
    expect(breakeven).toBeLessThan(100300);
  });
});

describe('calculateMinProfitableHolding', () => {
  it('should return positive min days', () => {
    const result = calculateMinProfitableHolding(10);
    expect(result.minDays).toBeGreaterThan(0);
    expect(result.minProfitPercent).toBeGreaterThan(0);
  });
});

const mockLots: TaxLot[] = [
  { purchaseDate: '2025-01-01', quantity: 100, costBasis: 10, currentPrice: 12, unrealizedPnL: 200, holdingDays: 90, isLongTerm: false },
  { purchaseDate: '2025-02-01', quantity: 100, costBasis: 11, currentPrice: 12, unrealizedPnL: 100, holdingDays: 60, isLongTerm: false },
  { purchaseDate: '2025-03-01', quantity: 100, costBasis: 9, currentPrice: 12, unrealizedPnL: 300, holdingDays: 30, isLongTerm: false },
  { purchaseDate: '2024-03-01', quantity: 100, costBasis: 8, currentPrice: 12, unrealizedPnL: 400, holdingDays: 395, isLongTerm: true },
];

describe('optimizeTaxLots', () => {
  it('should optimize using FIFO', () => {
    const result = optimizeTaxLots(mockLots, 150, 'FIFO');
    expect(result.method).toBe('FIFO');
    expect(result.lotsSold.length).toBeGreaterThan(0);
    expect(result.totalGain).toBeGreaterThan(0);
  });

  it('should optimize using HIFO', () => {
    const result = optimizeTaxLots(mockLots, 150, 'HIFO');
    expect(result.method).toBe('HIFO');
  });

  it('should handle selling all', () => {
    const result = optimizeTaxLots(mockLots, 400, 'FIFO');
    expect(result.lotsSold.length).toBe(4);
  });
});

describe('compareTaxMethods', () => {
  it('should compare all methods', () => {
    const results = compareTaxMethods(mockLots, 150);
    expect(results['FIFO']).toBeDefined();
    expect(results['LIFO']).toBeDefined();
    expect(results['HIFO']).toBeDefined();
    expect(results['LOFO']).toBeDefined();
  });
});

describe('calculateDividendTax', () => {
  it('should tax 20% for short-term holding', () => {
    const tax = calculateDividendTax('600519', 10, 15);
    expect(tax.taxRate).toBe(0.2);
    expect(tax.taxPerShare).toBe(2);
    expect(tax.netDividend).toBe(8);
  });

  it('should tax 10% for medium-term holding', () => {
    const tax = calculateDividendTax('600519', 10, 90);
    expect(tax.taxRate).toBe(0.1);
    expect(tax.netDividend).toBe(9);
  });

  it('should be tax-free for long-term holding', () => {
    const tax = calculateDividendTax('600519', 10, 400);
    expect(tax.taxRate).toBe(0);
    expect(tax.netDividend).toBe(10);
  });
});

describe('calculateOptimalDividendStrategy', () => {
  it('should recommend holding for short-term holders', () => {
    const result = calculateOptimalDividendStrategy(
      '600519', 5, '2025-06-15', '2025-06-01'
    );
    expect(result.taxRate).toBe(0.2);
    expect(result.recommendation).toContain('20%');
  });

  it('should confirm tax-free for long-term holders', () => {
    const result = calculateOptimalDividendStrategy(
      '600519', 5, '2025-06-15', '2024-01-01'
    );
    expect(result.taxRate).toBe(0);
  });
});

describe('calculateTotalTradingCost', () => {
  it('should sum all trade costs', () => {
    const trades = [
      { amount: 100000, isSell: false },
      { amount: 110000, isSell: true },
      { amount: 50000, isSell: false },
    ];
    const result = calculateTotalTradingCost(trades);
    expect(result.totalCost).toBeGreaterThan(0);
    expect(result.avgCostPerTrade).toBeGreaterThan(0);
    expect(result.costAsPercentOfVolume).toBeGreaterThan(0);
  });
});

describe('estimateAnnualCostImpact', () => {
  it('should estimate annual cost drag', () => {
    const result = estimateAnnualCostImpact(1000000, 500000, 24);
    expect(result.annualCost).toBeGreaterThan(0);
    expect(result.costPerTrade).toBeGreaterThan(0);
    expect(result.dragOnReturns).toBeGreaterThan(0);
  });
});
