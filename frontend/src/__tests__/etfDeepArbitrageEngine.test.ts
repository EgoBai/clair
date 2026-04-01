import { describe, it, expect } from 'vitest';
import { ETFDeepArbitrageEngine } from '../utils/etfDeepArbitrageEngine';
import type { ETFData } from '../utils/etfDeepArbitrageEngine';

describe('ETF深度套利引擎', () => {
  const engine = new ETFDeepArbitrageEngine();

  const createETF = (overrides: Partial<ETFData> = {}): ETFData => ({
    code: '510300',
    name: '沪深300ETF',
    nav: 4.5,
    marketPrice: 4.52,
    trackingError: 0.05,
    totalShares: 3000000,
    creationUnit: 90,
    iopv: 4.51,
    date: '2024-01-15',
    ...overrides
  });

  describe('calculateDiscount', () => {
    it('计算折溢价率', () => {
      const result = engine.calculateDiscount(createETF());
      expect(result.discount).toBeCloseTo((4.52 - 4.5) / 4.5 * 100);
    });

    it('溢价→申购套利', () => {
      const result = engine.calculateDiscount(createETF({ marketPrice: 5.0, nav: 4.0 }));
      expect(result.signal).toBe('create');
    });

    it('折价→赎回套利', () => {
      const result = engine.calculateDiscount(createETF({ marketPrice: 4.0, nav: 5.0 }));
      expect(result.signal).toBe('redeem');
    });

    it('微小偏差→中性', () => {
      const result = engine.calculateDiscount(createETF({ marketPrice: 4.505, nav: 4.5 }));
      expect(result.signal).toBe('neutral');
    });

    it('流动性评分', () => {
      const high = engine.calculateDiscount(createETF({ totalShares: 5000000 }));
      const low = engine.calculateDiscount(createETF({ totalShares: 10000 }));
      expect(high.liquidity).toBeGreaterThan(low.liquidity);
    });

    it('执行风险分级', () => {
      const low = engine.calculateDiscount(createETF({ totalShares: 500000 }));
      const high = engine.calculateDiscount(createETF({ totalShares: 10000 }));
      expect(low.executionRisk).toBe('low');
      expect(high.executionRisk).toBe('high');
    });

    it('净套利空间计算', () => {
      const result = engine.calculateDiscount(createETF());
      expect(typeof result.netArbitrage).toBe('number');
    });
  });

  describe('monitorRealTimeArbitrage', () => {
    it('计算理论净值', () => {
      const components = [
        { code: 'A', price: 10, weight: 0.5 },
        { code: 'B', price: 20, weight: 0.5 },
      ];
      const result = engine.monitorRealTimeArbitrage(createETF(), components);
      expect(result.theoreticalNAV).toBeCloseTo(15);
    });

    it('检测套利信号', () => {
      const components = [{ code: 'A', price: 4.0, weight: 1.0 }];
      const result = engine.monitorRealTimeArbitrage(
        createETF({ marketPrice: 4.5 }),
        components
      );
      expect(result.realTimeDiscount).toBeGreaterThan(0.3);
      expect(result.arbitrageSignal).toContain('溢价');
    });

    it('成分股偏差分析', () => {
      const components = [
        { code: 'A', price: 10, weight: 0.6 },
        { code: 'B', price: 20, weight: 0.4 },
      ];
      const result = engine.monitorRealTimeArbitrage(createETF(), components);
      expect(result.componentDeviations.length).toBe(2);
    });
  });

  describe('findCrossMarketArb', () => {
    it('找到跨市场套利', () => {
      const etfs = [
        createETF({ code: 'A', marketPrice: 4.8, nav: 4.5 }),
        createETF({ code: 'B', marketPrice: 4.5, nav: 4.5 }),
      ];
      const result = engine.findCrossMarketArb(etfs);
      expect(result.length).toBeGreaterThan(0);
    });

    it('按价差排序', () => {
      const etfs = [
        createETF({ code: 'A', marketPrice: 5.0, nav: 4.5 }),
        createETF({ code: 'B', marketPrice: 4.6, nav: 4.5 }),
        createETF({ code: 'C', marketPrice: 4.4, nav: 4.5 }),
      ];
      const result = engine.findCrossMarketArb(etfs);
      for (let i = 1; i < result.length; i++) {
        expect(Math.abs(result[i - 1].spread)).toBeGreaterThanOrEqual(Math.abs(result[i].spread));
      }
    });

    it('微小差异不产生套利', () => {
      const etfs = [
        createETF({ code: 'A', marketPrice: 4.50, nav: 4.50 }),
        createETF({ code: 'B', marketPrice: 4.51, nav: 4.50 }),
      ];
      const result = engine.findCrossMarketArb(etfs);
      expect(result.length).toBe(0);
    });

    it('包含时间窗口信息', () => {
      const etfs = [
        createETF({ code: 'A', marketPrice: 5.0, nav: 4.0 }),
        createETF({ code: 'B', marketPrice: 4.0, nav: 5.0 }),
      ];
      const result = engine.findCrossMarketArb(etfs);
      result.forEach(o => expect(o.timeWindow).toBeDefined());
    });
  });

  describe('analyzeDividendArb', () => {
    it('计算分红收益率', () => {
      const result = engine.analyzeDividendArb(createETF(), 0.1, '2024-06-15', 4.5);
      expect(result.dividendYield).toBeCloseTo(0.1 / 4.5 * 100);
    });

    it('含税影响', () => {
      const result = engine.analyzeDividendArb(createETF(), 0.5, '2024-06-15', 4.5);
      expect(result.taxImpact).toBeGreaterThan(0);
    });

    it('是否应持有', () => {
      const hold = engine.analyzeDividendArb(createETF(), 0.5, '2024-06-15', 4.5);
      expect(typeof hold.shouldHold).toBe('boolean');
    });
  });

  describe('analyzeLiquidity', () => {
    it('计算平均成交量', () => {
      const result = engine.analyzeLiquidity(createETF(), [10000, 20000, 30000], [0.01, 0.02]);
      expect(result.avgDailyVolume).toBeCloseTo(20000);
    });

    it('换手率计算', () => {
      const result = engine.analyzeLiquidity(createETF({ totalShares: 100000 }), [10000], [0.01]);
      expect(result.turnoverRate).toBeCloseTo(10);
    });

    it('流动性评分在0-100之间', () => {
      const result = engine.analyzeLiquidity(createETF(), [50000], [0.01]);
      expect(result.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(result.liquidityScore).toBeLessThanOrEqual(100);
    });

    it('冲击成本估算', () => {
      const result = engine.analyzeLiquidity(createETF(), [1000000], [0.005]);
      expect(result.marketImpact).toBeGreaterThan(0);
    });
  });
});
