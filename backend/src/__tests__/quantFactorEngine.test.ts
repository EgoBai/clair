import { describe, it, expect } from 'vitest';
import { QuantFactorEngine, StockData, FactorCategory } from '../services/quantFactorEngine';

function createStockData(overrides: Partial<StockData> = {}): StockData {
  const prices = Array.from({ length: 300 }, (_, i) => 100 + i * 0.5 + Math.random() * 5);
  const volumes = Array.from({ length: 300 }, () => 1000000 + Math.random() * 500000);
  return {
    code: '600519',
    name: '贵州茅台',
    prices,
    volumes,
    highs: prices.map(p => p * 1.02),
    lows: prices.map(p => p * 0.98),
    open: prices.map(p => p * 0.99),
    marketCap: 2_000_000_000_000,
    pe: 30,
    pb: 10,
    ps: 15,
    roe: 0.25,
    revenueGrowth: 0.15,
    earningsGrowth: 0.2,
    debtToEquity: 0.3,
    currentRatio: 2.5,
    grossMargin: 0.9,
    netMargin: 0.5,
    dividendYield: 0.01,
    sharesOutstanding: 1_256_000_000,
    ...overrides,
  };
}

describe('QuantFactorEngine', () => {
  let engine: QuantFactorEngine;

  beforeEach(() => {
    engine = new QuantFactorEngine();
  });

  describe('registerFactor / getFactor', () => {
    it('应该注册自定义因子', () => {
      engine.registerFactor({
        name: 'test_factor',
        category: 'momentum',
        description: '测试因子',
        calculate: () => 1,
      });
      expect(engine.getFactor('test_factor')).toBeDefined();
    });

    it('应该获取内置因子', () => {
      expect(engine.getFactor('momentum_1m')).toBeDefined();
      expect(engine.getFactor('ep')).toBeDefined();
      expect(engine.getFactor('roe')).toBeDefined();
    });

    it('不存在的因子应返回 undefined', () => {
      expect(engine.getFactor('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllFactors', () => {
    it('应该返回所有内置因子', () => {
      const factors = engine.getAllFactors();
      expect(factors.length).toBeGreaterThan(15);
    });

    it('每个因子应有必需字段', () => {
      const factors = engine.getAllFactors();
      for (const f of factors) {
        expect(f.name).toBeDefined();
        expect(f.category).toBeDefined();
        expect(typeof f.calculate).toBe('function');
      }
    });
  });

  describe('getFactorsByCategory', () => {
    it('应该按类别过滤', () => {
      const momentum = engine.getFactorsByCategory('momentum');
      expect(momentum.length).toBeGreaterThan(0);
      expect(momentum.every(f => f.category === 'momentum')).toBe(true);
    });

    it('value 类别应该包含 ep, bp, sp', () => {
      const value = engine.getFactorsByCategory('value');
      const names = value.map(f => f.name);
      expect(names).toContain('ep');
      expect(names).toContain('bp');
      expect(names).toContain('sp');
    });

    it('quality 类别应该包含 roe', () => {
      const quality = engine.getFactorsByCategory('quality');
      expect(quality.some(f => f.name === 'roe')).toBe(true);
    });
  });

  describe('单因子计算', () => {
    it('momentum_1m 应该计算正确', () => {
      const factor = engine.getFactor('momentum_1m')!;
      const data = createStockData();
      const value = factor.calculate(data);
      expect(typeof value).toBe('number');
      expect(isFinite(value!)).toBe(true);
    });

    it('数据不足时 momentum_1m 应返回 null', () => {
      const factor = engine.getFactor('momentum_1m')!;
      const data = createStockData({ prices: [1, 2, 3] });
      expect(factor.calculate(data)).toBeNull();
    });

    it('ep 应该返回 1/PE', () => {
      const factor = engine.getFactor('ep')!;
      const data = createStockData({ pe: 20 });
      expect(factor.calculate(data)).toBeCloseTo(0.05);
    });

    it('PE 为负时 ep 应返回 null', () => {
      const factor = engine.getFactor('ep')!;
      const data = createStockData({ pe: -5 });
      expect(factor.calculate(data)).toBeNull();
    });

    it('bp 应该返回 1/PB', () => {
      const factor = engine.getFactor('bp')!;
      const data = createStockData({ pb: 5 });
      expect(factor.calculate(data)).toBeCloseTo(0.2);
    });

    it('roe 应该返回 roe 值', () => {
      const factor = engine.getFactor('roe')!;
      const data = createStockData({ roe: 0.3 });
      expect(factor.calculate(data)).toBe(0.3);
    });

    it('revenue_growth 应该返回营收增长率', () => {
      const factor = engine.getFactor('revenue_growth')!;
      const data = createStockData({ revenueGrowth: 0.25 });
      expect(factor.calculate(data)).toBe(0.25);
    });

    it('volatility_1m 应该计算波动率', () => {
      const factor = engine.getFactor('volatility_1m')!;
      const data = createStockData();
      const value = factor.calculate(data);
      expect(typeof value).toBe('number');
      expect(value!).toBeGreaterThan(0);
    });

    it('volatility_1m 数据不足应返回 null', () => {
      const factor = engine.getFactor('volatility_1m')!;
      const data = createStockData({ prices: [1, 2, 3] });
      expect(factor.calculate(data)).toBeNull();
    });
  });

  describe('calculateFactorScores', () => {
    it('应该为股票计算因子得分', () => {
      const stocks = [
        createStockData({ code: '600519', name: '茅台' }),
        createStockData({ code: '000858', name: '五粮液', pe: 25, roe: 0.22 }),
        createStockData({ code: '002304', name: '洋河', pe: 35, roe: 0.18 }),
      ];

      const scores = engine.calculateFactorScores(stocks);
      expect(scores.length).toBe(3);
    });

    it('应该设置排名和百分位', () => {
      const stocks = [
        createStockData({ code: 'A' }),
        createStockData({ code: 'B' }),
        createStockData({ code: 'C' }),
      ];

      const scores = engine.calculateFactorScores(stocks);
      for (const score of scores) {
        expect(score.rank).toBeGreaterThan(0);
        expect(score.percentile).toBeGreaterThanOrEqual(0);
        expect(score.percentile).toBeLessThanOrEqual(100);
      }
    });

    it('应该支持指定因子子集', () => {
      const stocks = [createStockData(), createStockData({ code: '000858' })];
      const scores = engine.calculateFactorScores(stocks, ['ep', 'roe']);
      expect(scores.length).toBe(2);
      scores.forEach(s => {
        expect(s.factors.size).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('getFactorScore', () => {
    it('应该返回已计算的得分', () => {
      const stocks = [createStockData({ code: 'TEST' })];
      engine.calculateFactorScores(stocks);
      const score = engine.getFactorScore('TEST');
      expect(score).toBeDefined();
      expect(score?.code).toBe('TEST');
    });

    it('未计算的应返回 undefined', () => {
      expect(engine.getFactorScore('UNKNOWN')).toBeUndefined();
    });
  });

  describe('getTopStocks / getBottomStocks', () => {
    it('getTopStocks 应返回排名靠前的', () => {
      const stocks = [
        createStockData({ code: 'A', pe: 10 }),
        createStockData({ code: 'B', pe: 20 }),
        createStockData({ code: 'C', pe: 30 }),
      ];
      engine.calculateFactorScores(stocks);
      const top = engine.getTopStocks(2);
      expect(top.length).toBe(2);
      expect(top[0].rank).toBe(1);
    });

    it('getBottomStocks 应返回排名靠后的', () => {
      const stocks = [
        createStockData({ code: 'A', pe: 10 }),
        createStockData({ code: 'B', pe: 20 }),
        createStockData({ code: 'C', pe: 30 }),
      ];
      engine.calculateFactorScores(stocks);
      const bottom = engine.getBottomStocks(2);
      expect(bottom.length).toBe(2);
    });
  });
});
