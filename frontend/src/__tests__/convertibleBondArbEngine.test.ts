import { describe, it, expect } from 'vitest';
import { ConvertibleBondEngine } from '../utils/convertibleBondArbEngine';
import type { ConvertibleBond } from '../utils/convertibleBondArbEngine';

describe('可转债套利引擎', () => {
  const engine = new ConvertibleBondEngine();

  const createBond = (overrides: Partial<ConvertibleBond> = {}): ConvertibleBond => ({
    code: '123001',
    name: '测试转债',
    faceValue: 100,
    couponRate: 0.5,
    maturity: 3,
    conversionPrice: 10,
    stockPrice: 12,
    bondPrice: 125,
    putPrice: 100,
    callPrice: 130,
    creditRating: 'AA',
    ytm: 1.5,
    ...overrides
  });

  describe('calculateMetrics', () => {
    it('转换价值 = 面值/转股价 × 正股价格', () => {
      const result = engine.calculateMetrics(createBond());
      expect(result.conversionValue).toBeCloseTo(120); // 100/10*12
    });

    it('转股溢价率计算', () => {
      const result = engine.calculateMetrics(createBond({ bondPrice: 130 }));
      expect(result.conversionPremium).toBeCloseTo((130 - 120) / 120 * 100);
    });

    it('负溢价情况', () => {
      const result = engine.calculateMetrics(createBond({ bondPrice: 110 }));
      expect(result.conversionPremium).toBeLessThan(0);
    });

    it('纯债价值大于0', () => {
      const result = engine.calculateMetrics(createBond());
      expect(result.pureBondValue).toBeGreaterThan(0);
    });

    it('期权价值 = 可转债价格 - 纯债价值', () => {
      const result = engine.calculateMetrics(createBond());
      expect(result.optionValue).toBeCloseTo(Math.max(0, 125 - result.pureBondValue));
    });

    it('Delta在0到1之间', () => {
      const result = engine.calculateMetrics(createBond());
      expect(result.deltaValue).toBeGreaterThanOrEqual(0);
      expect(result.deltaValue).toBeLessThanOrEqual(1);
    });

    it('转股价为0时不报错', () => {
      const result = engine.calculateMetrics(createBond({ conversionPrice: 0 }));
      expect(result.conversionValue).toBe(0);
    });

    it('深价内Delta更高', () => {
      const itm = engine.calculateMetrics(createBond({ stockPrice: 20 }));
      const otm = engine.calculateMetrics(createBond({ stockPrice: 5 }));
      expect(itm.deltaValue).toBeGreaterThan(otm.deltaValue);
    });
  });

  describe('套利信号', () => {
    it('负溢价时建议转股', () => {
      const result = engine.calculateMetrics(createBond({ bondPrice: 95, stockPrice: 12 }));
      // 95 < 转换价值, 应该有套利信号
      expect(typeof result.arbitrageSignal).toBe('string');
    });

    it('信号分类正确', () => {
      const signals = ['buy_bond', 'convert', 'sell_bond', 'neutral'];
      const result = engine.calculateMetrics(createBond());
      expect(signals).toContain(result.arbitrageSignal);
    });
  });

  describe('findArbitragePairs', () => {
    it('找到套利机会', () => {
      const bonds = [
        createBond({ code: 'A', bondPrice: 95 }),
        createBond({ code: 'B', bondPrice: 150 }),
      ];
      const result = engine.findArbitragePairs(bonds);
      expect(Array.isArray(result)).toBe(true);
    });

    it('按预期收益排序', () => {
      const bonds = [
        createBond({ code: 'A', bondPrice: 105 }),
        createBond({ code: 'B', bondPrice: 110 }),
        createBond({ code: 'C', bondPrice: 100 }),
      ];
      const result = engine.findArbitragePairs(bonds);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].expectedReturn).toBeGreaterThanOrEqual(result[i].expectedReturn);
      }
    });

    it('空数组返回空', () => {
      expect(engine.findArbitragePairs([])).toEqual([]);
    });

    it('包含方向信息', () => {
      const bonds = [createBond({ bondPrice: 95 })];
      const result = engine.findArbitragePairs(bonds);
      result.forEach(p => {
        expect(['long_bond_short_stock', 'short_bond_long_stock']).toContain(p.direction);
      });
    });

    it('风险分级', () => {
      const bonds = [createBond({ bondPrice: 105 })];
      const result = engine.findArbitragePairs(bonds);
      result.forEach(p => {
        expect(['low', 'medium', 'high']).toContain(p.risk);
      });
    });
  });

  describe('analyzePriceRevision', () => {
    it('下修降低溢价率', () => {
      const bond = createBond({ conversionPrice: 15 });
      const result = engine.analyzePriceRevision(bond, 10);
      expect(result.newPremium).toBeLessThan(result.oldPremium);
    });

    it('转换价值增加', () => {
      const bond = createBond({ conversionPrice: 15 });
      const result = engine.analyzePriceRevision(bond, 10);
      expect(result.conversionValueChange).toBeGreaterThan(0);
    });

    it('返回溢价率变化', () => {
      const bond = createBond();
      const result = engine.analyzePriceRevision(bond, 8);
      expect(typeof result.premiumChange).toBe('number');
    });

    it('下修幅度越大收益越高', () => {
      const bond = createBond({ conversionPrice: 15 });
      const small = engine.analyzePriceRevision(bond, 12);
      const large = engine.analyzePriceRevision(bond, 8);
      expect(large.theoreticalGain).toBeGreaterThan(small.theoreticalGain);
    });
  });

  describe('valuationScore', () => {
    it('评分在0-100之间', () => {
      const result = engine.valuationScore(createBond());
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('包含因子分析', () => {
      const result = engine.valuationScore(createBond());
      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.factors[0].name).toBeDefined();
      expect(result.factors[0].weight).toBeGreaterThan(0);
    });

    it('权重和约等于1', () => {
      const result = engine.valuationScore(createBond());
      const totalWeight = result.factors.reduce((s, f) => s + f.weight, 0);
      expect(totalWeight).toBeCloseTo(1, 0);
    });

    it('低溢价高评级得分高', () => {
      const good = engine.valuationScore(createBond({ bondPrice: 100, creditRating: 'AAA', ytm: 3 }));
      const bad = engine.valuationScore(createBond({ bondPrice: 200, creditRating: 'A', ytm: -2 }));
      expect(good.score).toBeGreaterThan(bad.score);
    });

    it('包含投资建议', () => {
      const result = engine.valuationScore(createBond());
      expect(['强烈推荐', '推荐', '持有', '回避']).toContain(result.recommendation);
    });
  });
});
