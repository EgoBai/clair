import { describe, it, expect, beforeEach } from 'vitest';
import { CapitalFlowDepthEngine } from '../utils/capitalFlowDepth';
import type { TradeData } from '../utils/capitalFlowDepth';

describe('CapitalFlowDepthEngine', () => {
  let engine: CapitalFlowDepthEngine;

  const createTrade = (overrides: Partial<TradeData> = {}): TradeData => ({
    price: 10,
    volume: 1000,
    amount: 10000,
    direction: 'buy',
    timestamp: Date.now(),
    isLargeOrder: false,
    ...overrides,
  });

  beforeEach(() => {
    engine = new CapitalFlowDepthEngine();
  });

  describe('资金流向分析', () => {
    it('应该计算净流入', () => {
      const trades = [
        createTrade({ direction: 'buy', amount: 50000 }),
        createTrade({ direction: 'sell', amount: 30000 }),
      ];
      const result = engine.analyzeFlow(trades, 10);
      expect(result.netInflow).toBe(20000);
      expect(result.trend).toBe('inflow');
    });

    it('应该识别流出', () => {
      const trades = [
        createTrade({ direction: 'buy', amount: 20000 }),
        createTrade({ direction: 'sell', amount: 80000 }),
      ];
      const result = engine.analyzeFlow(trades, 10);
      expect(result.netInflow).toBeLessThan(0);
      expect(result.trend).toBe('outflow');
    });

    it('应该计算大单净流入', () => {
      const trades = [
        createTrade({ direction: 'buy', amount: 200000 }),
        createTrade({ direction: 'sell', amount: 150000 }),
      ];
      const result = engine.analyzeFlow(trades, 10);
      expect(result.largeOrderNetInflow).toBe(50000);
    });

    it('应该计算买卖比', () => {
      const trades = [
        createTrade({ direction: 'buy', amount: 60000 }),
        createTrade({ direction: 'sell', amount: 40000 }),
      ];
      const result = engine.analyzeFlow(trades, 10);
      expect(result.buySellRatio).toBeCloseTo(1.5, 1);
    });

    it('应该计算集中度', () => {
      const trades = [
        createTrade({ direction: 'buy', amount: 200000 }),
        createTrade({ direction: 'sell', amount: 5000 }),
      ];
      const result = engine.analyzeFlow(trades, 10);
      expect(result.concentration).toBeGreaterThan(0);
    });

    it('应该判断平衡趋势', () => {
      const trades = [
        createTrade({ direction: 'buy', amount: 50000 }),
        createTrade({ direction: 'sell', amount: 51000 }),
      ];
      const result = engine.analyzeFlow(trades, 10);
      expect(result.trend).toBe('balanced');
    });

    it('空交易应返回零值', () => {
      const result = engine.analyzeFlow([], 10);
      expect(result.netInflow).toBe(0);
      expect(result.trend).toBe('balanced');
    });
  });

  describe('筹码分布', () => {
    it('应该计算价格分布', () => {
      const trades = [
        createTrade({ price: 10, volume: 1000 }),
        createTrade({ price: 11, volume: 2000 }),
        createTrade({ price: 12, volume: 1500 }),
      ];
      const result = engine.calculateChipDistribution(trades, 11);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(r => r.percentage >= 0)).toBe(true);
    });

    it('应该判断盈亏', () => {
      const trades = [
        createTrade({ price: 9, volume: 1000 }),
        createTrade({ price: 11, volume: 1000 }),
      ];
      const result = engine.calculateChipDistribution(trades, 10);
      const belowCost = result.filter(c => c.priceLevel < 10);
      const aboveCost = result.filter(c => c.priceLevel >= 10);
      if (belowCost.length > 0) expect(belowCost[0].isProfit).toBe(true);
      if (aboveCost.length > 0) expect(aboveCost[0].isProfit).toBe(false);
    });

    it('空交易应返回空数组', () => {
      expect(engine.calculateChipDistribution([], 10)).toHaveLength(0);
    });
  });

  describe('获利盘比例', () => {
    it('应该计算获利盘', () => {
      const trades = [
        createTrade({ price: 9, volume: 3000 }),  // 获利
        createTrade({ price: 11, volume: 7000 }), // 亏损
      ];
      const ratio = engine.calculateProfitRatio(trades, 10);
      expect(ratio).toBeCloseTo(0.3, 1);
    });

    it('全部获利应返回1', () => {
      const trades = [
        createTrade({ price: 8, volume: 1000 }),
        createTrade({ price: 9, volume: 1000 }),
      ];
      const ratio = engine.calculateProfitRatio(trades, 10);
      expect(ratio).toBe(1);
    });

    it('空交易应返回0', () => {
      expect(engine.calculateProfitRatio([], 10)).toBe(0);
    });
  });

  describe('主力行为', () => {
    it('应该检测吸筹', () => {
      const trades = [
        createTrade({ direction: 'buy', amount: 2000000 }),
        createTrade({ direction: 'buy', amount: 1500000 }),
      ];
      const result = engine.detectMainForceAction(trades);
      expect(result.action).toBe('accumulating');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('应该检测派发', () => {
      const trades = [
        createTrade({ direction: 'sell', amount: 2000000 }),
        createTrade({ direction: 'sell', amount: 1500000 }),
      ];
      const result = engine.detectMainForceAction(trades);
      expect(result.action).toBe('distributing');
    });

    it('无大单应返回中性', () => {
      const trades = [
        createTrade({ direction: 'buy', amount: 1000 }),
      ];
      const result = engine.detectMainForceAction(trades);
      expect(result.action).toBe('neutral');
    });

    it('应该包含描述', () => {
      const trades = [createTrade({ direction: 'buy', amount: 2000000 })];
      const result = engine.detectMainForceAction(trades);
      expect(result.description).toBeTruthy();
    });
  });
});
