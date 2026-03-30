import { describe, it, expect } from 'vitest';
import {
  calculateDividendTaxRate,
  calculateExRightsReferencePrice,
  AdjustmentEngine,
  describeDividendEvent,
  calculateDividendYield,
  calculateTotalBonusRatio,
  type ExRightsEvent,
} from '../utils/exRights';

function makeEvent(overrides: Partial<ExRightsEvent> = {}): ExRightsEvent {
  return {
    id: 'evt-1',
    symbol: '600519',
    announceDate: '2024-05-20',
    exRightsDate: '2024-06-01',
    type: 'cash_dividend',
    cashDividendPerShare: 0.5,
    bonusSharesPerShare: 0,
    capitalReservePerShare: 0,
    taxRate: 0.1,
    description: '',
    ...overrides,
  };
}

describe('Ex-Rights Engine Proper', () => {
  describe('Dividend Tax Rate', () => {
    it('should charge 20% for holding < 1 month', () => {
      expect(calculateDividendTaxRate(10)).toBe(0.2);
      expect(calculateDividendTaxRate(25)).toBe(0.2);
    });

    it('should charge 10% for holding 1 month to 1 year', () => {
      expect(calculateDividendTaxRate(31)).toBe(0.1);
      expect(calculateDividendTaxRate(180)).toBe(0.1);
      expect(calculateDividendTaxRate(364)).toBe(0.1);
    });

    it('should charge 0% for holding > 1 year', () => {
      expect(calculateDividendTaxRate(366)).toBe(0);
      expect(calculateDividendTaxRate(730)).toBe(0);
    });

    it('should handle boundary at exactly 30 days', () => {
      expect(calculateDividendTaxRate(30)).toBe(0.1);
    });

    it('should handle boundary at exactly 365 days', () => {
      expect(calculateDividendTaxRate(365)).toBe(0);
    });

    it('should handle zero days', () => {
      expect(calculateDividendTaxRate(0)).toBe(0.2);
    });
  });

  describe('Ex-Rights Reference Price', () => {
    it('should calculate pure cash dividend with default tax', () => {
      const price = calculateExRightsReferencePrice(10, 0.5, 0, 0);
      expect(price).toBeCloseTo(9.55, 2);
    });

    it('should calculate pure cash dividend with 0 tax', () => {
      const price = calculateExRightsReferencePrice(10, 0.5, 0, 0, 0);
      expect(price).toBeCloseTo(9.5, 2);
    });

    it('should calculate pure bonus shares', () => {
      const price = calculateExRightsReferencePrice(10, 0, 0.3, 0, 0);
      expect(price).toBeCloseTo(10 / 1.3, 4);
    });

    it('should calculate pure capital reserve shares', () => {
      const price = calculateExRightsReferencePrice(10, 0, 0, 0.5, 0);
      expect(price).toBeCloseTo(10 / 1.5, 4);
    });

    it('should calculate mixed dividend + bonus', () => {
      const price = calculateExRightsReferencePrice(20, 1, 0.2, 0);
      expect(price).toBeCloseTo((20 - 0.9) / 1.2, 4);
    });

    it('should return original price for no dividend', () => {
      expect(calculateExRightsReferencePrice(15, 0, 0, 0)).toBe(15);
    });
  });

  describe('AdjustmentEngine', () => {
    it('should create engine instance', () => {
      const engine = new AdjustmentEngine();
      expect(engine).toBeDefined();
    });

    it('should add ex-rights events', () => {
      const engine = new AdjustmentEngine();
      engine.addEvent(makeEvent());
      const factors = engine.getAdjustmentFactors('600519');
      expect(factors.size).toBeGreaterThan(0);
    });

    it('should batch add events', () => {
      const engine = new AdjustmentEngine();
      engine.addEvents([
        makeEvent({ id: '1', exRightsDate: '2024-03-01', cashDividendPerShare: 0.3 }),
        makeEvent({ id: '2', exRightsDate: '2024-06-01', cashDividendPerShare: 0.5 }),
        makeEvent({ id: '3', exRightsDate: '2024-09-01', cashDividendPerShare: 0.4 }),
      ]);
      const factors = engine.getAdjustmentFactors('600519');
      expect(factors.size).toBe(3);
    });

    it('should deduplicate events', () => {
      const engine = new AdjustmentEngine();
      engine.addEvent(makeEvent());
      engine.addEvent(makeEvent());
      const factors = engine.getAdjustmentFactors('600519');
      expect(factors.size).toBe(1);
    });

    it('should handle empty kline data', () => {
      const engine = new AdjustmentEngine();
      const result = engine.adjustKLineData('600519', [], 'forward');
      expect(result).toEqual([]);
    });

    it('should handle no events (passthrough)', () => {
      const engine = new AdjustmentEngine();
      const kline = [
        { tradeDate: '2024-01-01', open: 10, close: 10.5, high: 11, low: 9.5, volume: 1000, amount: 10000 },
      ];
      const result = engine.adjustKLineData('600519', kline, 'forward');
      expect(result.length).toBe(1);
      expect(result[0].close).toBeCloseTo(10.5, 2);
    });

    it('should forward adjust with cash dividend', () => {
      const engine = new AdjustmentEngine();
      engine.addEvent(makeEvent({ exRightsDate: '2024-06-01', cashDividendPerShare: 1 }));
      const kline = [
        { tradeDate: '2024-01-01', open: 10, close: 10, high: 10, low: 10, volume: 1000, amount: 10000 },
        { tradeDate: '2024-06-02', open: 9, close: 9, high: 9, low: 9, volume: 1000, amount: 9000 },
      ];
      const result = engine.adjustKLineData('600519', kline, 'forward');
      expect(result.length).toBe(2);
      expect(result[1].adjustmentFactor).toBeLessThanOrEqual(1);
    });

    it('should support backward adjustment', () => {
      const engine = new AdjustmentEngine();
      engine.addEvent(makeEvent({ exRightsDate: '2024-06-01', cashDividendPerShare: 0.5 }));
      const kline = [
        { tradeDate: '2024-01-01', open: 10, close: 10, high: 10, low: 10, volume: 1000, amount: 10000 },
        { tradeDate: '2024-06-02', open: 9.5, close: 9.5, high: 9.5, low: 9.5, volume: 1000, amount: 9500 },
      ];
      const result = engine.adjustKLineData('600519', kline, 'backward');
      expect(result.length).toBe(2);
    });

    it('should support no adjustment', () => {
      const engine = new AdjustmentEngine();
      engine.addEvent(makeEvent());
      const kline = [
        { tradeDate: '2024-01-01', open: 10, close: 10, high: 10, low: 10, volume: 1000, amount: 10000 },
        { tradeDate: '2024-06-02', open: 9.5, close: 9.5, high: 9.5, low: 9.5, volume: 1000, amount: 9500 },
      ];
      const result = engine.adjustKLineData('600519', kline, { type: 'none' });
      expect(result.length).toBe(2);
      // 'none' mode should preserve original prices
      expect(result[0].close).toBeCloseTo(10, 1);
      expect(result[1].close).toBeCloseTo(9.5, 1);
    });

    it('should calculate adjusted change percent', () => {
      const engine = new AdjustmentEngine();
      const adjusted = [
        { tradeDate: '2024-01-01', open: 10, close: 10, high: 10, low: 10, volume: 1000, amount: 10000, adjustmentFactor: 1, adjustmentType: 'forward' as const },
        { tradeDate: '2024-01-02', open: 10.5, close: 10.5, high: 10.5, low: 10.5, volume: 1000, amount: 10500, adjustmentFactor: 1, adjustmentType: 'forward' as const },
      ];
      const changes = engine.calculateAdjustedChangePercent(adjusted);
      expect(changes.length).toBe(2);
      expect(changes[0]).toBe(0);
      expect(changes[1]).toBeCloseTo(5, 1);
    });
  });

  describe('Dividend Description', () => {
    it('should describe cash dividend per 10 shares', () => {
      // cashDividendPerShare=0.5 → 每10股派5.00元
      const desc = describeDividendEvent(makeEvent({ cashDividendPerShare: 0.5 }));
      expect(desc).toContain('每10股派5.00元');
    });

    it('should describe bonus shares', () => {
      const desc = describeDividendEvent(makeEvent({
        type: 'bonus_share',
        cashDividendPerShare: 0,
        bonusSharesPerShare: 0.3,
      }));
      expect(desc).toContain('每10股送3股');
    });

    it('should describe capital reserve', () => {
      const desc = describeDividendEvent(makeEvent({
        type: 'capital_reserve',
        cashDividendPerShare: 0,
        capitalReservePerShare: 0.5,
      }));
      expect(desc).toContain('每10股转增5股');
    });

    it('should describe mixed dividend', () => {
      const desc = describeDividendEvent(makeEvent({
        type: 'mixed',
        cashDividendPerShare: 0.5,
        bonusSharesPerShare: 0.2,
        capitalReservePerShare: 0.3,
      }));
      expect(desc.length).toBeGreaterThan(0);
      expect(desc).toContain('，');
    });

    it('should return 无分红方案 for empty', () => {
      const desc = describeDividendEvent(makeEvent({
        cashDividendPerShare: 0,
        bonusSharesPerShare: 0,
        capitalReservePerShare: 0,
      }));
      expect(desc).toBe('无分红方案');
    });
  });

  describe('Dividend Yield', () => {
    it('should calculate dividend yield correctly', () => {
      const yieldRate = calculateDividendYield(0.5, 10);
      expect(yieldRate).toBeCloseTo(5, 2);
    });

    it('should handle zero price', () => {
      expect(calculateDividendYield(0.5, 0)).toBe(0);
    });

    it('should handle zero dividend', () => {
      expect(calculateDividendYield(0, 10)).toBe(0);
    });
  });

  describe('Total Bonus Ratio', () => {
    it('should calculate total bonus ratio per 10 shares', () => {
      // (0.2 + 0.3) * 10 = 5
      const ratio = calculateTotalBonusRatio(makeEvent({
        type: 'mixed',
        bonusSharesPerShare: 0.2,
        capitalReservePerShare: 0.3,
      }));
      expect(ratio).toBe(5);
    });

    it('should return 0 for pure cash dividend', () => {
      const ratio = calculateTotalBonusRatio(makeEvent());
      expect(ratio).toBe(0);
    });

    it('should handle only bonus shares', () => {
      // 0.1 * 10 = 1
      const ratio = calculateTotalBonusRatio(makeEvent({
        bonusSharesPerShare: 0.1,
        capitalReservePerShare: 0,
      }));
      expect(ratio).toBe(1);
    });
  });
});
