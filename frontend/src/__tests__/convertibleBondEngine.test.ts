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

/**
 * 可转债分析引擎测试（导入真实模块）
 */

describe('Convertible Bond Engine', () => {
  const sampleBond: ConvertibleBond = {
    code: '123456',
    name: '测试转债',
    ticker: '600000',
    stockName: '测试正股',
    price: 115,
    parValue: 100,
    stockPrice: 12,
    conversionPrice: 10,
    conversionRatio: 10,
    couponRate: [0.3, 0.5, 0.8, 1.5, 2.0],
    yearsToMaturity: 3,
    creditRating: 'AA',
    putPrice: 100,
    callPrice: 130,
    callTriggerPrice: 13, // 转股价*1.3
    putTriggerDays: 30,
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
    it('应该正确计算溢价率（真实模块返回小数比例）', () => {
      const premium = calcConversionPremium(sampleBond);
      expect(premium).toBeCloseTo(-0.0417, 3); // (115-120)/120
    });

    it('转债价格高于转股价值应该有正溢价', () => {
      const expensiveBond = { ...sampleBond, price: 150 };
      expect(calcConversionPremium(expensiveBond)).toBeGreaterThan(0);
    });
  });

  describe('债底价值', () => {
    it('应该计算债底（>0 且 <面值附近）', () => {
      const floor = calcBondFloor(sampleBond);
      expect(floor).toBeGreaterThan(0);
      expect(floor).toBeLessThan(120);
    });

    it('到期时间越长债底越低（本金折现主导）', () => {
      const shortBond = { ...sampleBond, yearsToMaturity: 1 };
      const longBond = { ...sampleBond, yearsToMaturity: 5 };
      expect(calcBondFloor(shortBond)).toBeGreaterThan(calcBondFloor(longBond));
    });
  });

  describe('估值 analyzeCBValuation', () => {
    it('应该返回完整估值结果', () => {
      const valuation = analyzeCBValuation(sampleBond);
      expect(valuation.conversionValue).toBeDefined();
      expect(valuation.conversionPremium).toBeDefined();
      expect(valuation.bondFloor).toBeDefined();
      expect(valuation.theoreticalPrice).toBeDefined();
      expect(typeof valuation.underpriced).toBe('boolean');
      expect(typeof valuation.overpriced).toBe('boolean');
    });

    it('低估应该标记 underpriced', () => {
      const cheapBond = { ...sampleBond, price: 90 };
      const valuation = analyzeCBValuation(cheapBond);
      expect(valuation.underpriced).toBe(true);
    });

    it('高估应该标记 overpriced', () => {
      const expensiveBond = { ...sampleBond, price: 200 };
      const valuation = analyzeCBValuation(expensiveBond);
      expect(valuation.overpriced).toBe(true);
    });
  });

  describe('强赎触发 analyzeTriggers', () => {
    it('应该检测强赎触发', () => {
      const triggerBond = { ...sampleBond, stockPrice: 15 }; // 15 >= 13
      expect(analyzeTriggers(triggerBond).callRisk.triggered).toBe(true);
    });

    it('未触发应该返回 false', () => {
      expect(analyzeTriggers(sampleBond).callRisk.triggered).toBe(false); // 12 < 13
    });
  });

  describe('筛选与排名', () => {
    it('filterBonds 按溢价率/价格/评级过滤', () => {
      const bonds = [
        sampleBond,
        { ...sampleBond, code: '222222', name: '高价债', price: 200, creditRating: 'AAA' },
        { ...sampleBond, code: '333333', name: '低评级', price: 110, creditRating: 'A-' },
      ];
      const result = filterBonds(bonds, {
        minPremium: -1,
        maxPremium: 1,
        minYtm: 0,
        maxPrice: 130,
        minRating: 'AA',
        excludeCalled: false,
      });
      expect(result.find(b => b.code === '222222')).toBeUndefined(); // 价格超限
      expect(result.find(b => b.code === '333333')).toBeUndefined(); // 评级不足
      expect(result.find(b => b.code === '123456')).toBeDefined();
    });

    it('dualLowRanking 按双低值升序排名', () => {
      const bonds = [
        { ...sampleBond, code: 'A', price: 130 },
        { ...sampleBond, code: 'B', price: 100 },
      ];
      const ranked = dualLowRanking(bonds);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[0].dualLowScore).toBeLessThanOrEqual(ranked[1].dualLowScore);
    });
  });
});
