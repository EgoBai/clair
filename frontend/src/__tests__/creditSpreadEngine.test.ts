import { describe, it, expect } from 'vitest';
import { CreditSpreadEngine, type CreditSpread } from '../utils/creditSpreadEngine';

describe('信用利差分析引擎', () => {
  const engine = new CreditSpreadEngine();

  const createSpread = (overrides: Partial<CreditSpread> = {}): CreditSpread => ({
    bondCode: 'SH123456',
    issuerName: '测试公司',
    rating: 'AA',
    maturity: 3,
    yieldRate: 5.5,
    benchmarkRate: 3.0,
    spread: 250,
    date: '2024-01-15',
    ...overrides
  });

  describe('calculateSpread', () => {
    it('利差 = 收益率 - 基准利率', () => {
      expect(engine.calculateSpread(5.5, 3.0)).toBe(250);
    });

    it('负利差情况', () => {
      expect(engine.calculateSpread(2.0, 3.0)).toBe(-100);
    });

    it('零利差', () => {
      expect(engine.calculateSpread(3.0, 3.0)).toBe(0);
    });
  });

  describe('calculateRiskScore', () => {
    it('AAA级评分最高', () => {
      const aaa = engine.calculateRiskScore(createSpread({ rating: 'AAA' }));
      const bbb = engine.calculateRiskScore(createSpread({ rating: 'BBB' }));
      expect(aaa.score).toBeGreaterThan(bbb.score);
    });

    it('评级越差PD越高', () => {
      const aa = engine.calculateRiskScore(createSpread({ rating: 'AA' }));
      const bb = engine.calculateRiskScore(createSpread({ rating: 'BB' }));
      expect(bb.pd).toBeGreaterThan(aa.pd);
    });

    it('包含公允利差计算', () => {
      const result = engine.calculateRiskScore(createSpread());
      expect(result.spreadFairValue).toBeGreaterThan(0);
    });

    it('利差偏差可正可负', () => {
      const expensive = engine.calculateRiskScore(createSpread({ spread: 500 }));
      const cheap = engine.calculateRiskScore(createSpread({ spread: 10 }));
      expect(expensive.spreadDeviation).toBeGreaterThan(0);
      expect(cheap.spreadDeviation).toBeLessThan(0);
    });

    it('D级评分为0', () => {
      const result = engine.calculateRiskScore(createSpread({ rating: 'D' }));
      expect(result.score).toBe(0);
      expect(result.pd).toBe(100);
    });

    it('LGD在0-100之间', () => {
      const ratings = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];
      for (const rating of ratings) {
        const result = engine.calculateRiskScore(createSpread({ rating }));
        expect(result.lgd).toBeGreaterThanOrEqual(0);
        expect(result.lgd).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('buildSpreadCurve', () => {
    it('空数组返回空曲线', () => {
      const result = engine.buildSpreadCurve([]);
      expect(result.tenors).toEqual([]);
      expect(result.slope).toBe(0);
    });

    it('按期限排序', () => {
      const spreads = [
        createSpread({ maturity: 5, spread: 300 }),
        createSpread({ maturity: 1, spread: 100 }),
        createSpread({ maturity: 3, spread: 200 }),
      ];
      const result = engine.buildSpreadCurve(spreads);
      expect(result.tenors).toEqual([1, 3, 5]);
      expect(result.spreads).toEqual([100, 200, 300]);
    });

    it('正斜率表示正常曲线', () => {
      const spreads = [
        createSpread({ maturity: 1, spread: 100 }),
        createSpread({ maturity: 3, spread: 200 }),
        createSpread({ maturity: 5, spread: 300 }),
      ];
      const result = engine.buildSpreadCurve(spreads);
      expect(result.slope).toBeGreaterThan(0);
      expect(result.inversion).toBe(false);
    });

    it('检测倒挂', () => {
      const spreads = [
        createSpread({ maturity: 1, spread: 300 }),
        createSpread({ maturity: 5, spread: 100 }),
      ];
      const result = engine.buildSpreadCurve(spreads);
      expect(result.inversion).toBe(true);
    });

    it('曲率计算不报错', () => {
      const spreads = [
        createSpread({ maturity: 1, spread: 100 }),
        createSpread({ maturity: 2, spread: 250 }),
        createSpread({ maturity: 3, spread: 200 }),
      ];
      const result = engine.buildSpreadCurve(spreads);
      expect(typeof result.curvature).toBe('number');
    });
  });

  describe('calculateMigrationMatrix', () => {
    it('返回迁移概率', () => {
      const transitions = [
        { from: 'AA', to: 'AA' },
        { from: 'AA', to: 'AA' },
        { from: 'AA', to: 'A' },
        { from: 'A', to: 'AA' },
        { from: 'A', to: 'A' },
      ];
      const result = engine.calculateMigrationMatrix(transitions);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].probability).toBeGreaterThan(0);
      expect(result[0].probability).toBeLessThanOrEqual(1);
    });

    it('概率总和不超过1', () => {
      const transitions = [
        { from: 'AA', to: 'AA' },
        { from: 'AA', to: 'A' },
        { from: 'AA', to: 'BBB' },
      ];
      const result = engine.calculateMigrationMatrix(transitions);
      const aaMigrations = result.filter(m => m.fromRating === 'AA');
      const totalProb = aaMigrations.reduce((s, m) => s + m.probability, 0);
      expect(totalProb).toBeCloseTo(1);
    });

    it('包含利差影响', () => {
      const transitions = [{ from: 'AA', to: 'A' }];
      const result = engine.calculateMigrationMatrix(transitions);
      expect(result[0].spreadImpact).toBeDefined();
    });
  });

  describe('calculateZSpread', () => {
    it('计算Z-spread', () => {
      const spotRates = [3.0, 3.2, 3.5, 3.8, 4.0];
      const result = engine.calculateZSpread(98, 100, 5, 5, spotRates);
      expect(typeof result).toBe('number');
    });

    it('空利率返回0', () => {
      expect(engine.calculateZSpread(100, 100, 5, 5, [])).toBe(0);
    });

    it('零期限返回0', () => {
      expect(engine.calculateZSpread(100, 100, 5, 0, [3])).toBe(0);
    });
  });

  describe('approximateOAS', () => {
    it('OAS小于Z-spread', () => {
      const zSpread = 200;
      const oas = engine.approximateOAS(zSpread, 50, 20);
      expect(oas).toBeLessThan(zSpread);
    });

    it('OAS不为负', () => {
      const oas = engine.approximateOAS(10, 50, 20);
      expect(oas).toBeGreaterThanOrEqual(0);
    });
  });

  describe('decomposeSpread', () => {
    it('利差分解包含所有组成部分', () => {
      const result = engine.decomposeSpread(createSpread());
      expect(result.defaultRisk).toBeDefined();
      expect(result.liquidityPremium).toBeDefined();
      expect(result.termPremium).toBeDefined();
      expect(result.taxPremium).toBeDefined();
      expect(result.residual).toBeDefined();
    });

    it('长期债券期限溢价更高', () => {
      const short = engine.decomposeSpread(createSpread({ maturity: 1 }));
      const long = engine.decomposeSpread(createSpread({ maturity: 10 }));
      expect(long.termPremium).toBeGreaterThan(short.termPremium);
    });

    it('高评级违约风险低', () => {
      const aaa = engine.decomposeSpread(createSpread({ rating: 'AAA' }));
      const bb = engine.decomposeSpread(createSpread({ rating: 'BB' }));
      expect(aaa.defaultRisk).toBeLessThan(bb.defaultRisk);
    });
  });
});
