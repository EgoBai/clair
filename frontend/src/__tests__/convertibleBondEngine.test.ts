import { describe, it, expect } from 'vitest';

/**
 * 可转债分析引擎测试
 */

interface ConvertibleBond {
  code: string;
  name: string;
  price: number;
  stockPrice: number;
  conversionPrice: number;
  conversionRatio: number;
  yearsToMaturity: number;
  couponRate: number[];
  callPrice: number;
  putPrice: number;
  ytm: number;
}

interface CBValuation {
  conversionValue: number;
  conversionPremium: number;
  bondFloor: number;
  bondPremium: number;
  theoreticalPrice: number;
  underpriced: boolean;
  overpriced: boolean;
  fairRange: { low: number; high: number };
}

function calcConversionValue(bond: ConvertibleBond): number {
  return bond.stockPrice * bond.conversionRatio;
}

function calcConversionPremium(bond: ConvertibleBond): number {
  const convValue = calcConversionValue(bond);
  return convValue > 0 ? ((bond.price - convValue) / convValue) * 100 : 0;
}

function calcBondFloor(bond: ConvertibleBond, discountRate: number = 0.03): number {
  let floor = 0;
  for (let i = 0; i < bond.yearsToMaturity; i++) {
    const coupon = bond.couponRate[i] || bond.couponRate[bond.couponRate.length - 1] || 0;
    floor += coupon / Math.pow(1 + discountRate, i + 1);
  }
  floor += 100 / Math.pow(1 + discountRate, bond.yearsToMaturity);
  return Math.round(floor * 100) / 100;
}

function calcBondPremium(bond: ConvertibleBond, bondFloor: number): number {
  return bondFloor > 0 ? ((bond.price - bondFloor) / bondFloor) * 100 : 0;
}

function valuateBond(bond: ConvertibleBond): CBValuation {
  const conversionValue = calcConversionValue(bond);
  const conversionPremium = calcConversionPremium(bond);
  const bondFloor = calcBondFloor(bond);
  const bondPremium = calcBondPremium(bond, bondFloor);
  const theoreticalPrice = Math.max(conversionValue, bondFloor);
  const underpriced = bond.price < theoreticalPrice * 0.95;
  const overpriced = bond.price > theoreticalPrice * 1.3;
  const fairRange = {
    low: Math.round(theoreticalPrice * 0.95 * 100) / 100,
    high: Math.round(theoreticalPrice * 1.1 * 100) / 100,
  };

  return {
    conversionValue: Math.round(conversionValue * 100) / 100,
    conversionPremium: Math.round(conversionPremium * 100) / 100,
    bondFloor: Math.round(bondFloor * 100) / 100,
    bondPremium: Math.round(bondPremium * 100) / 100,
    theoreticalPrice: Math.round(theoreticalPrice * 100) / 100,
    underpriced,
    overpriced,
    fairRange,
  };
}

function isCallTriggered(bond: ConvertibleBond, triggerRatio: number = 1.3): boolean {
  return bond.stockPrice >= bond.conversionPrice * triggerRatio;
}

function calcYTM(price: number, faceValue: number, coupon: number, years: number): number {
  if (years <= 0 || price <= 0) return 0;
  // Approximate YTM
  const avgCoupon = coupon;
  return ((avgCoupon + (faceValue - price) / years) / ((faceValue + price) / 2)) * 100;
}

describe('Convertible Bond Engine', () => {
  const sampleBond: ConvertibleBond = {
    code: '123456',
    name: '测试转债',
    price: 115,
    stockPrice: 12,
    conversionPrice: 10,
    conversionRatio: 10,
    yearsToMaturity: 3,
    couponRate: [0.3, 0.5, 0.8, 1.5, 2.0],
    callPrice: 130,
    putPrice: 100,
    ytm: 2.5,
  };

  describe('转股价值', () => {
    it('应该正确计算转股价值', () => {
      const value = calcConversionValue(sampleBond);
      expect(value).toBe(120); // 12 * 10
    });

    it('转股价值=正股价格*转股比例', () => {
      expect(calcConversionValue(sampleBond)).toBe(sampleBond.stockPrice * sampleBond.conversionRatio);
    });
  });

  describe('转股溢价率', () => {
    it('应该正确计算溢价率', () => {
      const premium = calcConversionPremium(sampleBond);
      expect(premium).toBeCloseTo(-4.17, 1); // (115-120)/120
    });

    it('转债价格高于转股价值应该有正溢价', () => {
      const expensiveBond = { ...sampleBond, price: 150 };
      expect(calcConversionPremium(expensiveBond)).toBeGreaterThan(0);
    });
  });

  describe('债底价值', () => {
    it('应该计算债底', () => {
      const floor = calcBondFloor(sampleBond);
      expect(floor).toBeGreaterThan(0);
      expect(floor).toBeLessThan(120); // 应低于面值加票息
    });

    it('到期时间越长债底越低(折现)', () => {
      const shortBond = { ...sampleBond, yearsToMaturity: 1 };
      const longBond = { ...sampleBond, yearsToMaturity: 5 };
      expect(calcBondFloor(shortBond)).toBeGreaterThan(calcBondFloor(longBond));
    });
  });

  describe('估值', () => {
    it('应该返回完整估值结果', () => {
      const valuation = valuateBond(sampleBond);
      expect(valuation.conversionValue).toBeDefined();
      expect(valuation.conversionPremium).toBeDefined();
      expect(valuation.bondFloor).toBeDefined();
      expect(valuation.theoreticalPrice).toBeDefined();
    });

    it('低估应该标记underpriced', () => {
      const cheapBond = { ...sampleBond, price: 90 };
      const valuation = valuateBond(cheapBond);
      expect(valuation.underpriced).toBe(true);
    });

    it('高估应该标记overpriced', () => {
      const expensiveBond = { ...sampleBond, price: 200 };
      const valuation = valuateBond(expensiveBond);
      expect(valuation.overpriced).toBe(true);
    });
  });

  describe('强赎触发', () => {
    it('应该检测强赎触发', () => {
      const triggerBond = { ...sampleBond, stockPrice: 15 }; // 15 >= 10*1.3
      expect(isCallTriggered(triggerBond)).toBe(true);
    });

    it('未触发应该返回false', () => {
      expect(isCallTriggered(sampleBond)).toBe(false); // 12 < 10*1.3
    });
  });

  describe('到期收益率', () => {
    it('应该计算YTM', () => {
      const ytm = calcYTM(115, 100, 1, 3);
      expect(typeof ytm).toBe('number');
    });

    it('面值购买应该YTM等于票息', () => {
      const ytm = calcYTM(100, 100, 5, 5);
      expect(ytm).toBeCloseTo(5, 1);
    });
  });
});
