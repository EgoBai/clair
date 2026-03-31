import { describe, it, expect } from 'vitest';
import {
  analyzeOrderFlow,
  analyzeOrderBookImbalance,
  calculateVPIN,
  OrderFlowData,
  OrderBook,
} from '../utils/microstructureEngine';

function makeOrders(n = 100): OrderFlowData[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: `2026-03-01 ${String(9 + Math.floor(i / 10)).padStart(2, '0')}:${String((i * 3) % 60).padStart(2, '0')}`,
    price: 100 + Math.random() * 5,
    volume: Math.floor(Math.random() * 5000) + 100,
    side: Math.random() > 0.48 ? 'buy' as const : 'sell' as const,
    isLarge: Math.random() > 0.85,
  }));
}

function makeOrderBook(): OrderBook {
  return {
    ticker: '600519',
    timestamp: '2026-03-01 10:00:00',
    bids: Array.from({ length: 10 }, (_, i) => ({ price: 100 - i * 0.01, volume: 1000 + i * 500, orders: 5 + i })),
    asks: Array.from({ length: 10 }, (_, i) => ({ price: 100.1 + i * 0.01, volume: 800 + i * 400, orders: 4 + i })),
    lastPrice: 100.05,
  };
}

describe('Microstructure Engine', () => {
  describe('analyzeOrderFlow', () => {
    it('应分析买卖量', () => {
      const result = analyzeOrderFlow(makeOrders());
      expect(result.buyVolume).toBeGreaterThan(0);
      expect(result.sellVolume).toBeGreaterThan(0);
      expect(result.netVolume).toBe(result.buyVolume - result.sellVolume);
    });

    it('应计算VPIN', () => {
      const result = analyzeOrderFlow(makeOrders());
      expect(result.vpin).toBeGreaterThanOrEqual(0);
      expect(result.vpin).toBeLessThanOrEqual(1);
    });

    it('应计算大单不平衡', () => {
      const result = analyzeOrderFlow(makeOrders());
      expect(result.largeOrderImbalance).toBeGreaterThanOrEqual(-1);
      expect(result.largeOrderImbalance).toBeLessThanOrEqual(1);
    });

    it('应计算主动性指数', () => {
      const result = analyzeOrderFlow(makeOrders());
      expect(result.aggressionIndex).toBeGreaterThanOrEqual(0);
      expect(result.aggressionIndex).toBeLessThanOrEqual(100);
    });

    it('应判断信号', () => {
      const result = analyzeOrderFlow(makeOrders());
      expect(['bullish', 'bearish', 'neutral']).toContain(result.signal);
    });

    it('应计算订单流毒性', () => {
      const result = analyzeOrderFlow(makeOrders());
      expect(result.flowToxicity).toBeGreaterThanOrEqual(0);
      expect(result.flowToxicity).toBeLessThanOrEqual(100);
    });

    it('应处理空数据', () => {
      const result = analyzeOrderFlow([]);
      expect(result.signal).toBe('neutral');
      expect(result.vpin).toBe(0.5);
    });
  });

  describe('analyzeOrderBookImbalance', () => {
    it('应计算买卖比', () => {
      const result = analyzeOrderBookImbalance(makeOrderBook());
      expect(result.bidAskRatio).toBeGreaterThan(0);
    });

    it('应计算点差', () => {
      const result = analyzeOrderBookImbalance(makeOrderBook());
      expect(result.spreadBp).toBeGreaterThan(0);
    });

    it('应计算深度不平衡', () => {
      const result = analyzeOrderBookImbalance(makeOrderBook());
      expect(result.depthImbalance).toBeGreaterThanOrEqual(-1);
      expect(result.depthImbalance).toBeLessThanOrEqual(1);
    });

    it('应计算加权中间价', () => {
      const result = analyzeOrderBookImbalance(makeOrderBook());
      expect(result.weightedMidPrice).toBeGreaterThan(0);
    });

    it('应评估流动性', () => {
      const result = analyzeOrderBookImbalance(makeOrderBook());
      expect(result.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(result.liquidityScore).toBeLessThanOrEqual(100);
    });

    it('应判断买卖压力', () => {
      const result = analyzeOrderBookImbalance(makeOrderBook());
      expect(['buy', 'sell', 'balanced']).toContain(result.pressure);
    });
  });

  describe('calculateVPIN', () => {
    it('应计算VPIN值', () => {
      const result = calculateVPIN(makeOrders(200), 20);
      expect(result.vpin).toBeGreaterThanOrEqual(0);
      expect(result.vpin).toBeLessThanOrEqual(1);
    });

    it('应分类VPIN', () => {
      const result = calculateVPIN(makeOrders(200), 20);
      expect(['toxic', 'elevated', 'normal', 'quiet']).toContain(result.classification);
    });

    it('应计算置信区间', () => {
      const result = calculateVPIN(makeOrders(200), 20);
      expect(result.confidenceInterval[0]).toBeLessThanOrEqual(result.confidenceInterval[1]);
    });

    it('应处理空数据', () => {
      const result = calculateVPIN([], 10);
      expect(result.vpin).toBe(0.5);
    });
  });
});
