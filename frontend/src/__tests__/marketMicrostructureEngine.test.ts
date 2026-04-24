import { describe, it, expect } from 'vitest';
import { MarketMicrostructureEngine, type OrderBook, type TradeTick } from '../utils/marketMicrostructureEngine';

describe('MarketMicrostructureEngine', () => {
  const engine = new MarketMicrostructureEngine();

  const makeOrderBook = (): OrderBook => ({
    bids: [
      { price: 10.00, volume: 5000 },
      { price: 9.99, volume: 8000 },
      { price: 9.98, volume: 10000 },
    ],
    asks: [
      { price: 10.02, volume: 4000 },
      { price: 10.03, volume: 6000 },
      { price: 10.04, volume: 9000 },
    ],
    timestamp: Date.now(),
  });

  const makeTick = (overrides: Partial<TradeTick> = {}): TradeTick => ({
    price: 10.01,
    volume: 1000,
    timestamp: Date.now(),
    aggressor: 'buy',
    ...overrides,
  });

  describe('订单簿分析', () => {
    it('应计算买卖价差', () => {
      const result = engine.analyzeOrderBook(makeOrderBook());
      expect(result.spread).toBeCloseTo(0.02, 2);
      expect(result.midPrice).toBeCloseTo(10.01, 2);
    });

    it('价差应为正值', () => {
      const result = engine.analyzeOrderBook(makeOrderBook());
      expect(result.spread).toBeGreaterThan(0);
      expect(result.spreadBps).toBeGreaterThan(0);
    });

    it('应计算订单不平衡', () => {
      const result = engine.analyzeOrderBook(makeOrderBook());
      expect(result.orderImbalance).toBeGreaterThan(-1);
      expect(result.orderImbalance).toBeLessThan(1);
    });

    it('应计算买卖深度', () => {
      const result = engine.analyzeOrderBook(makeOrderBook());
      expect(result.depth.bid).toBe(23000); // 5000+8000+10000
      expect(result.depth.ask).toBe(19000); // 4000+6000+9000
    });

    it('流动性评分应在0-100之间', () => {
      const result = engine.analyzeOrderBook(makeOrderBook());
      expect(result.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(result.liquidityScore).toBeLessThanOrEqual(100);
    });

    it('窄价差应有高流动性', () => {
      const tightBook: OrderBook = {
        bids: [{ price: 10.000, volume: 100000 }],
        asks: [{ price: 10.001, volume: 100000 }],
        timestamp: Date.now(),
      };
      const result = engine.analyzeOrderBook(tightBook);
      expect(result.liquidityScore).toBeGreaterThan(60);
    });

    it('空订单簿不应报错', () => {
      const empty: OrderBook = { bids: [], asks: [], timestamp: Date.now() };
      const result = engine.analyzeOrderBook(empty);
      expect(result.spread).toBe(0);
    });

    it('应限制分析深度', () => {
      const result = engine.analyzeOrderBook(makeOrderBook(), 2);
      expect(result.depth.bid).toBe(13000); // 只取前2层
    });
  });

  describe('VWAP/TWAP', () => {
    it('应计算VWAP', () => {
      const ticks = [
        makeTick({ price: 10, volume: 1000 }),
        makeTick({ price: 10.05, volume: 2000 }),
        makeTick({ price: 10.02, volume: 1000 }),
      ];
      const result = engine.calculateVWAP(ticks, 5000);
      expect(result.vwap).toBeGreaterThan(0);
      expect(result.vwap).toBeCloseTo(10.03, 1);
    });

    it('应计算TWAP', () => {
      const ticks = [
        makeTick({ price: 10 }),
        makeTick({ price: 10.1 }),
        makeTick({ price: 10.2 }),
      ];
      const result = engine.calculateVWAP(ticks, 3000);
      expect(result.twap).toBeCloseTo(10.1, 1);
    });

    it('应计算参与率', () => {
      const ticks = [makeTick({ volume: 2500 })];
      const result = engine.calculateVWAP(ticks, 10000);
      expect(result.participation).toBe(25);
    });

    it('空数据应返回零', () => {
      const result = engine.calculateVWAP([], 1000);
      expect(result.vwap).toBe(0);
      expect(result.twap).toBe(0);
    });

    it('所有价格相同时滑点应为0', () => {
      const ticks = [
        makeTick({ price: 10 }),
        makeTick({ price: 10 }),
        makeTick({ price: 10 }),
      ];
      const result = engine.calculateVWAP(ticks, 3000);
      expect(result.slippage).toBe(0);
    });
  });

  describe('买卖压力', () => {
    it('应计算买入压力', () => {
      const ticks = [
        makeTick({ aggressor: 'buy', volume: 3000 }),
        makeTick({ aggressor: 'sell', volume: 1000 }),
      ];
      const result = engine.analyzeBuySellPressure(ticks);
      expect(result.buyPressure).toBeGreaterThan(result.sellPressure);
      expect(result.netPressure).toBeGreaterThan(0);
    });

    it('应计算卖出压力', () => {
      const ticks = [
        makeTick({ aggressor: 'buy', volume: 1000 }),
        makeTick({ aggressor: 'sell', volume: 3000 }),
      ];
      const result = engine.analyzeBuySellPressure(ticks);
      expect(result.sellPressure).toBeGreaterThan(result.buyPressure);
      expect(result.netPressure).toBeLessThan(0);
    });

    it('买卖平衡应有接近0的净压力', () => {
      const ticks = [
        makeTick({ aggressor: 'buy', volume: 2000 }),
        makeTick({ aggressor: 'sell', volume: 2000 }),
      ];
      const result = engine.analyzeBuySellPressure(ticks);
      expect(result.netPressure).toBeCloseTo(0, 1);
    });

    it('空tick应返回中性', () => {
      const result = engine.analyzeBuySellPressure([]);
      expect(result.aggressorRatio).toBe(0.5);
    });

    it('aggressorRatio应在0-1之间', () => {
      const ticks = [makeTick({ aggressor: 'buy' }), makeTick({ aggressor: 'sell' })];
      const result = engine.analyzeBuySellPressure(ticks);
      expect(result.aggressorRatio).toBeGreaterThanOrEqual(0);
      expect(result.aggressorRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('最优执行策略', () => {
    it('应返回执行参数', () => {
      const exec = engine.estimateOptimalExecution(50000, makeOrderBook(), 'medium');
      expect(exec.slices).toBeGreaterThan(0);
      expect(exec.timeEstimate).toBeGreaterThan(0);
      expect(exec.expectedCost).toBeGreaterThan(0);
    });

    it('紧急程度越高，切片越少', () => {
      const low = engine.estimateOptimalExecution(50000, makeOrderBook(), 'low');
      const high = engine.estimateOptimalExecution(50000, makeOrderBook(), 'high');
      expect(low.slices).toBeGreaterThanOrEqual(high.slices);
    });

    it('紧急程度越高，时间越短', () => {
      const low = engine.estimateOptimalExecution(50000, makeOrderBook(), 'low');
      const high = engine.estimateOptimalExecution(50000, makeOrderBook(), 'high');
      expect(low.timeEstimate).toBeGreaterThanOrEqual(high.timeEstimate);
    });

    it('空订单簿不应报错', () => {
      const empty: OrderBook = { bids: [], asks: [], timestamp: Date.now() };
      expect(() => engine.estimateOptimalExecution(10000, empty, 'medium')).not.toThrow();
    });
  });

  describe('边界情况', () => {
    it('单边订单簿不应报错', () => {
      const halfBook: OrderBook = {
        bids: [{ price: 10, volume: 5000 }],
        asks: [],
        timestamp: Date.now(),
      };
      expect(() => engine.analyzeOrderBook(halfBook)).not.toThrow();
    });

    it('零价格不应报错', () => {
      const book: OrderBook = {
        bids: [{ price: 0, volume: 1000 }],
        asks: [{ price: 0, volume: 1000 }],
        timestamp: Date.now(),
      };
      const result = engine.analyzeOrderBook(book);
      expect(result.midPrice).toBe(0);
    });

    it('零成交量tick不应报错', () => {
      expect(() => engine.calculateVWAP([makeTick({ volume: 0 })], 100)).not.toThrow();
    });
  });
});
