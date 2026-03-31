import { describe, it, expect } from 'vitest';
import {
  calcConversionValue,
  calcConversionPremium,
  calcBondFloor,
  analyzeCBValuation,
  analyzeTriggers,
  filterBonds,
  dualLowRanking,
  type ConvertibleBond,
} from '../utils/convertibleBondEngine';

function makeBond(overrides: Partial<ConvertibleBond> = {}): ConvertibleBond {
  return {
    code: '110001',
    name: '测试转债',
    ticker: '600001',
    stockName: '测试股票',
    price: 110,
    parValue: 100,
    stockPrice: 10,
    conversionPrice: 8,
    conversionRatio: 100 / 8, // 12.5
    couponRate: [0.3, 0.5, 0.8, 1.0, 1.5, 2.0],
    yearsToMaturity: 3,
    creditRating: 'AA',
    putPrice: 95,
    callPrice: 130,
    callTriggerPrice: 10.4, // 8 * 1.3
    putTriggerDays: 30,
    ytm: 0.02,
    ...overrides,
  };
}

describe('Convertible Bond Engine', () => {
  describe('calcConversionValue', () => {
    it('should calculate conversion value', () => {
      const bond = makeBond({ stockPrice: 10, conversionRatio: 12.5 });
      expect(calcConversionValue(bond)).toBeCloseTo(125, 1);
    });

    it('should be 0 for zero stock price', () => {
      const bond = makeBond({ stockPrice: 0 });
      expect(calcConversionValue(bond)).toBe(0);
    });
  });

  describe('calcConversionPremium', () => {
    it('should calculate premium rate', () => {
      const bond = makeBond({ price: 110, stockPrice: 10, conversionRatio: 12.5 });
      // CV = 125, premium = (110-125)/125 = -0.12
      expect(calcConversionPremium(bond)).toBeCloseTo(-0.12, 2);
    });

    it('should return Infinity for zero conversion value', () => {
      const bond = makeBond({ stockPrice: 0 });
      expect(calcConversionPremium(bond)).toBe(Infinity);
    });

    it('should be positive when price > conversion value', () => {
      const bond = makeBond({ price: 150, stockPrice: 10, conversionRatio: 12.5 });
      expect(calcConversionPremium(bond)).toBeGreaterThan(0);
    });
  });

  describe('calcBondFloor', () => {
    it('should return reasonable floor value', () => {
      const bond = makeBond();
      const floor = calcBondFloor(bond);
      expect(floor).toBeGreaterThan(0);
      expect(floor).toBeLessThan(150);
    });

    it('should increase with higher coupons', () => {
      const low = makeBond({ couponRate: [0.1, 0.1, 0.1] });
      const high = makeBond({ couponRate: [5, 5, 5] });
      expect(calcBondFloor(high)).toBeGreaterThan(calcBondFloor(low));
    });
  });

  describe('analyzeCBValuation', () => {
    it('should provide complete valuation', () => {
      const bond = makeBond();
      const val = analyzeCBValuation(bond);

      expect(val.code).toBe('110001');
      expect(val.conversionValue).toBeGreaterThan(0);
      expect(val.bondFloor).toBeGreaterThan(0);
      expect(val.fairRange.low).toBeLessThan(val.fairRange.high);
    });

    it('should detect underpriced bonds', () => {
      const bond = makeBond({ price: 80, stockPrice: 10, conversionRatio: 12.5 });
      const val = analyzeCBValuation(bond);
      expect(val.underpriced).toBe(true);
    });
  });

  describe('analyzeTriggers', () => {
    it('should detect call risk', () => {
      const bond = makeBond({ stockPrice: 11, callTriggerPrice: 10.4 });
      const trigger = analyzeTriggers(bond);
      expect(trigger.callRisk.triggered).toBe(true);
    });

    it('should calculate distance to call trigger', () => {
      const bond = makeBond({ stockPrice: 8, callTriggerPrice: 10.4 });
      const trigger = analyzeTriggers(bond);
      expect(trigger.callRisk.triggered).toBe(false);
      expect(trigger.callRisk.distance).toBeGreaterThan(0);
    });

    it('should detect put opportunity', () => {
      const bond = makeBond({ price: 90, putPrice: 95 });
      const trigger = analyzeTriggers(bond);
      expect(trigger.putOpportunity.active).toBe(true);
      expect(trigger.putOpportunity.protection).toBeGreaterThan(0);
    });

    it('should guide conversion decision', () => {
      const bond = makeBond({ price: 100, stockPrice: 10, conversionRatio: 12.5 });
      const trigger = analyzeTriggers(bond);
      // CV = 125 > 100, should convert
      expect(trigger.conversionDecision.shouldConvert).toBe(true);
    });
  });

  describe('filterBonds', () => {
    it('should filter by criteria', () => {
      const bonds = [
        makeBond({ code: 'A', price: 100, creditRating: 'AA+' }),
        makeBond({ code: 'B', price: 150, creditRating: 'AA' }),
        makeBond({ code: 'C', price: 90, creditRating: 'A' }),
      ];
      const filtered = filterBonds(bonds, {
        minPremium: -0.5,
        maxPremium: 0.5,
        minYtm: -0.1,
        maxPrice: 120,
        minRating: 'AA',
        excludeCalled: false,
      });
      filtered.forEach(b => {
        expect(b.price).toBeLessThanOrEqual(120);
      });
    });

    it('should exclude called bonds', () => {
      const bonds = [
        makeBond({ code: 'CALLED', stockPrice: 15, callTriggerPrice: 10.4 }),
        makeBond({ code: 'SAFE', stockPrice: 5, callTriggerPrice: 10.4 }),
      ];
      const filtered = filterBonds(bonds, {
        minPremium: -1,
        maxPremium: 10,
        minYtm: -1,
        maxPrice: 1000,
        minRating: 'A',
        excludeCalled: true,
      });
      expect(filtered.find(b => b.code === 'CALLED')).toBeUndefined();
      expect(filtered.find(b => b.code === 'SAFE')).toBeDefined();
    });
  });

  describe('dualLowRanking', () => {
    it('should rank by price + premium', () => {
      const bonds = [
        makeBond({ code: 'HIGH', price: 150 }),
        makeBond({ code: 'LOW', price: 90 }),
        makeBond({ code: 'MID', price: 110 }),
      ];
      const ranking = dualLowRanking(bonds);

      expect(ranking[0].rank).toBe(1);
      expect(ranking[0].dualLowScore).toBeLessThanOrEqual(ranking[1].dualLowScore);
    });

    it('should include all bonds', () => {
      const bonds = [makeBond({ code: 'A' }), makeBond({ code: 'B' })];
      const ranking = dualLowRanking(bonds);
      expect(ranking.length).toBe(2);
    });
  });
});
