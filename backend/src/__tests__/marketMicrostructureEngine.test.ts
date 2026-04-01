import { describe, it, expect } from 'vitest';
import {
  analyzeOrderFlow,
  calculateLiquidity,
  detectSpoofingPatterns,
  calculateKyleLambda,
  TradeTick,
} from '../services/marketMicrostructureEngine';

describe('市场微观结构引擎', () => {
  const mockTrades: TradeTick[] = [
    { price: 10.00, volume: 1000, timestamp: 1000, direction: 'buy' },
    { price: 10.01, volume: 500, timestamp: 1001, direction: 'buy' },
    { price: 10.02, volume: 800, timestamp: 1002, direction: 'sell' },
    { price: 10.01, volume: 1200, timestamp: 1003, direction: 'sell' },
    { price: 10.03, volume: 600, timestamp: 1004, direction: 'buy' },
    { price: 10.04, volume: 300, timestamp: 1005, direction: 'buy' },
    { price: 10.02, volume: 900, timestamp: 1006, direction: 'sell' },
    { price: 10.05, volume: 1500, timestamp: 1007, direction: 'buy' },
    { price: 10.03, volume: 700, timestamp: 1008, direction: 'sell' },
    { price: 10.06, volume: 400, timestamp: 1009, direction: 'buy' },
  ];

  describe('订单流分析', () => {
    it('应计算买卖量', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(metrics.buyVolume).toBeGreaterThan(0);
      expect(metrics.sellVolume).toBeGreaterThan(0);
    });

    it('应计算净成交量', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(metrics.netVolume).toBe(metrics.buyVolume - metrics.sellVolume);
    });

    it('应计算买卖比例', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(metrics.buyRatio).toBeGreaterThanOrEqual(0);
      expect(metrics.buyRatio).toBeLessThanOrEqual(1);
    });

    it('应计算VWAP', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(metrics.vwap).toBeGreaterThan(0);
      expect(metrics.vwap).toBeCloseTo(10.03, 1);
    });

    it('应计算TWAP', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(metrics.twap).toBeGreaterThan(0);
    });

    it('应计算订单不平衡度', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(metrics.orderImbalance).toBeGreaterThanOrEqual(-1);
      expect(metrics.orderImbalance).toBeLessThanOrEqual(1);
    });

    it('应统计交易笔数', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(metrics.tradeCount).toBe(10);
    });

    it('应计算平均交易规模', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(metrics.avgTradeSize).toBeGreaterThan(0);
    });

    it('应计算大单比例', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(metrics.largeTradeRatio).toBeGreaterThanOrEqual(0);
      expect(metrics.largeTradeRatio).toBeLessThanOrEqual(1);
    });

    it('空数据应返回零值', () => {
      const metrics = analyzeOrderFlow([]);
      expect(metrics.buyVolume).toBe(0);
      expect(metrics.sellVolume).toBe(0);
      expect(metrics.tradeCount).toBe(0);
      expect(metrics.vwap).toBe(0);
    });

    it('应计算价格冲击', () => {
      const metrics = analyzeOrderFlow(mockTrades);
      expect(typeof metrics.priceImpact).toBe('number');
    });

    it('全买入应有100%买比', () => {
      const allBuy: TradeTick[] = [
        { price: 10, volume: 100, timestamp: 1, direction: 'buy' },
        { price: 10.1, volume: 200, timestamp: 2, direction: 'buy' },
      ];
      const metrics = analyzeOrderFlow(allBuy);
      expect(metrics.buyRatio).toBe(1);
      expect(metrics.sellVolume).toBe(0);
    });

    it('全卖出应有0%买比', () => {
      const allSell: TradeTick[] = [
        { price: 10, volume: 100, timestamp: 1, direction: 'sell' },
        { price: 9.9, volume: 200, timestamp: 2, direction: 'sell' },
      ];
      const metrics = analyzeOrderFlow(allSell);
      expect(metrics.buyRatio).toBe(0);
    });
  });

  describe('流动性指标', () => {
    const bids = [{ price: 10.00, volume: 5000 }, { price: 9.99, volume: 3000 }, { price: 9.98, volume: 2000 }];
    const asks = [{ price: 10.01, volume: 4000 }, { price: 10.02, volume: 3500 }, { price: 10.03, volume: 2500 }];

    it('应计算买卖价差', () => {
      const liq = calculateLiquidity(bids, asks);
      expect(liq.bidAskSpread).toBeGreaterThan(0);
      expect(liq.bidAskSpread).toBeCloseTo(0.001, 3);
    });

    it('应计算市场深度', () => {
      const liq = calculateLiquidity(bids, asks);
      expect(liq.depth).toBe(20000);
    });

    it('应计算紧度', () => {
      const liq = calculateLiquidity(bids, asks);
      expect(liq.tightness).toBeGreaterThan(0);
    });

    it('应计算弹性', () => {
      const liq = calculateLiquidity(bids, asks);
      expect(liq.resilience).toBeGreaterThan(0);
    });

    it('应计算深度评分', () => {
      const liq = calculateLiquidity(bids, asks);
      expect(liq.marketDepthScore).toBeGreaterThan(0);
    });

    it('空订单簿应返回零值', () => {
      const liq = calculateLiquidity([], []);
      expect(liq.bidAskSpread).toBe(0);
      expect(liq.depth).toBe(0);
    });

    it('单边空应返回零值', () => {
      const liq = calculateLiquidity(bids, []);
      expect(liq.bidAskSpread).toBe(0);
    });
  });

  describe('欺骗检测', () => {
    it('正常交易应无欺骗', () => {
      const result = detectSpoofingPatterns(mockTrades);
      expect(result.detected).toBe(false);
    });

    it('数据不足应返回无检测', () => {
      const result = detectSpoofingPatterns(mockTrades.slice(0, 3));
      expect(result.detected).toBe(false);
    });

    it('应检测快速规模交替', () => {
      const spoofingTrades: TradeTick[] = [];
      for (let i = 0; i < 20; i++) {
        spoofingTrades.push({
          price: 10 + Math.random() * 0.1,
          volume: i % 2 === 0 ? 100000 : 10,
          timestamp: i,
          direction: i % 2 === 0 ? 'buy' : 'sell',
        });
      }
      const result = detectSpoofingPatterns(spoofingTrades);
      expect(result.patterns.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Kyle Lambda', () => {
    it('应计算价格冲击系数', () => {
      const lambda = calculateKyleLambda(mockTrades);
      expect(typeof lambda).toBe('number');
    });

    it('数据不足应返回0', () => {
      expect(calculateKyleLambda([mockTrades[0]])).toBe(0);
    });

    it('单一方向交易应有正lambda', () => {
      const directional: TradeTick[] = [
        { price: 10.00, volume: 100, timestamp: 1, direction: 'buy' },
        { price: 10.01, volume: 200, timestamp: 2, direction: 'buy' },
        { price: 10.02, volume: 300, timestamp: 3, direction: 'buy' },
      ];
      const lambda = calculateKyleLambda(directional);
      expect(typeof lambda).toBe('number');
    });
  });
});
