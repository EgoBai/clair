import { describe, it, expect } from 'vitest';
import {
  analyzeStockBondCorrelation,
  analyzeCreditSpreads,
  analyzeConvertibleBond,
  analyzeInterestRateSensitivity,
  BondData,
} from '../utils/bondEquityEngine';

function makeBond(overrides: Partial<BondData> = {}): BondData {
  return {
    ticker: '110059',
    name: '测试转债',
    type: 'convertible',
    faceValue: 100,
    couponRate: 0.5,
    maturity: '2028-06-30',
    yield: 2.5,
    price: 105,
    creditRating: 'AA',
    duration: 2.5,
    ...overrides,
  };
}

describe('Bond Equity Engine', () => {
  describe('analyzeStockBondCorrelation', () => {
    it('应计算股债相关性', () => {
      const stockReturns = Array.from({ length: 90 }, () => (Math.random() - 0.5) * 4);
      const bondYields = Array.from({ length: 90 }, () => 2.5 + (Math.random() - 0.5) * 0.5);
      const result = analyzeStockBondCorrelation(stockReturns, bondYields, 100, 2.5, 5);
      expect(result.correlation90d).toBeGreaterThanOrEqual(-1);
      expect(result.correlation90d).toBeLessThanOrEqual(1);
    });

    it('应计算股债利差', () => {
      const stockReturns = Array.from({ length: 30 }, () => Math.random());
      const bondYields = Array.from({ length: 30 }, () => 2.5);
      const result = analyzeStockBondCorrelation(stockReturns, bondYields, 100, 2.5, 5);
      expect(result.spread).toBeCloseTo(2.5, 1); // 5 - 2.5 = 2.5
    });

    it('应判断信号', () => {
      const stockReturns = Array.from({ length: 90 }, () => (Math.random() - 0.5) * 2);
      const bondYields = Array.from({ length: 90 }, () => 2.5);
      const result = analyzeStockBondCorrelation(stockReturns, bondYields, 100, 2.5, 5);
      expect(['stocks_cheap', 'bonds_cheap', 'neutral', 'extreme_stocks', 'extreme_bonds']).toContain(result.signal);
    });

    it('应处理不足数据', () => {
      const result = analyzeStockBondCorrelation([1, 2], [1, 2], 100, 2.5, 5);
      expect(result.signal).toBe('neutral');
    });
  });

  describe('analyzeCreditSpreads', () => {
    it('应分析信用利差', () => {
      const bonds = [
        makeBond({ creditRating: 'AAA', yield: 3.0 }),
        makeBond({ creditRating: 'AA', yield: 3.5 }),
        makeBond({ creditRating: 'A', yield: 4.5 }),
      ];
      const result = analyzeCreditSpreads(bonds, 2.0);
      expect(result.length).toBeGreaterThan(0);
    });

    it('应评估风险等级', () => {
      const bonds = [makeBond({ creditRating: 'A', yield: 6.0 })];
      const result = analyzeCreditSpreads(bonds, 2.0);
      expect(['low', 'moderate', 'elevated', 'high']).toContain(result[0].riskLevel);
    });
  });

  describe('analyzeConvertibleBond', () => {
    it('应计算转股价值', () => {
      const result = analyzeConvertibleBond(makeBond(), 50, 40);
      expect(result.conversionRatio).toBeGreaterThan(0);
      expect(result.conversionValue).toBeGreaterThan(0);
    });

    it('应计算转股溢价率', () => {
      const result = analyzeConvertibleBond(makeBond({ price: 120 }), 50, 40);
      expect(typeof result.premium).toBe('number');
    });

    it('应计算债底', () => {
      const result = analyzeConvertibleBond(makeBond(), 50, 40);
      expect(result.bondFloor).toBeGreaterThan(0);
    });

    it('应给出投资策略', () => {
      const result = analyzeConvertibleBond(makeBond(), 50, 40);
      expect(['convert', 'hold_bond', 'sell', 'arbitrage']).toContain(result.strategy);
    });

    it('应计算到期收益率', () => {
      const result = analyzeConvertibleBond(makeBond(), 50, 40);
      expect(typeof result.ytm).toBe('number');
    });
  });

  describe('analyzeInterestRateSensitivity', () => {
    it('应计算组合久期', () => {
      const bonds = [makeBond({ duration: 3 }), makeBond({ duration: 5 })];
      const result = analyzeInterestRateSensitivity(bonds);
      expect(result.portfolioDuration).toBeGreaterThan(0);
    });

    it('应计算利率冲击影响', () => {
      const bonds = [makeBond({ duration: 3 })];
      const result = analyzeInterestRateSensitivity(bonds);
      expect(result.rateShock100bp).toBeLessThan(0); // 利率上升，价格下跌
      expect(result.rateShockMinus50bp).toBeGreaterThan(0); // 利率下降，价格上涨
    });

    it('应计算凸性', () => {
      const bonds = [makeBond({ duration: 3 })];
      const result = analyzeInterestRateSensitivity(bonds);
      expect(result.convexity).toBeGreaterThan(0);
    });

    it('应计算免疫缺口', () => {
      const bonds = [makeBond({ duration: 3 })];
      const result = analyzeInterestRateSensitivity(bonds, 5);
      expect(result.immunizationGap).toBe(2); // 5 - 3 = 2
    });
  });
});
