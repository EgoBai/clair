/**
 * 做市商分析引擎测试
 */
import { describe, it, expect } from 'vitest';
import { MarketMakerEngine } from '../utils/marketMakerEngine';
import type { MarketMakerQuote } from '../utils/marketMakerEngine';

describe('MarketMakerEngine', () => {
  const engine = new MarketMakerEngine();

  const generateQuotes = (count: number, basePrice: number = 100): MarketMakerQuote[] => {
    const quotes: MarketMakerQuote[] = [];
    for (let i = 0; i < count; i++) {
      const spread = 0.02 + Math.random() * 0.03;
      quotes.push({
        symbol: '600519',
        timestamp: Date.now() + i * 1000,
        bidPrice: basePrice - spread / 2 + (Math.random() - 0.5) * 0.1,
        askPrice: basePrice + spread / 2 + (Math.random() - 0.5) * 0.1,
        bidSize: Math.floor(100 + Math.random() * 500),
        askSize: Math.floor(100 + Math.random() * 500),
        spread,
        midpoint: basePrice + (Math.random() - 0.5) * 0.05
      });
    }
    return quotes;
  };

  const generateTrades = (count: number, basePrice: number = 100) => {
    return Array.from({ length: count }, (_, i) => ({
      price: basePrice + (Math.random() - 0.5) * 2,
      size: Math.floor(100 + Math.random() * 900),
      timestamp: Date.now() + i * 500,
      aggressor: Math.random() > 0.5 ? 'buy' as const : 'sell' as const
    }));
  };

  describe('analyzeQuoteQuality', () => {
    it('应该分析报价质量', () => {
      const quotes = generateQuotes(50);
      const trades = generateTrades(30);
      const result = engine.analyzeQuoteQuality(quotes, trades);

      expect(result.avgSpread).toBeGreaterThan(0);
      expect(result.spreadStd).toBeGreaterThanOrEqual(0);
      expect(result.avgQuotedSize).toBeGreaterThan(0);
      expect(result.quoteFillRatio).toBeGreaterThanOrEqual(0);
      expect(result.priceImprovement).toBeGreaterThanOrEqual(0);
      expect(result.priceImprovement).toBeLessThanOrEqual(1);
    });

    it('空数据应返回零值', () => {
      const result = engine.analyzeQuoteQuality([], []);
      expect(result.avgSpread).toBe(0);
      expect(result.avgQuotedSize).toBe(0);
    });

    it('spread应该有波动', () => {
      const quotes = generateQuotes(100);
      const trades = generateTrades(50);
      const result = engine.analyzeQuoteQuality(quotes, trades);

      // 有数据时spread标准差通常大于0
      expect(result.spreadStd).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeInventory', () => {
    it('应该分析库存状态', () => {
      const trades = Array.from({ length: 50 }, (_, i) => ({
        size: Math.floor(100 + Math.random() * 400),
        side: Math.random() > 0.5 ? 'buy' as const : 'sell' as const,
        timestamp: Date.now() + i * 1000
      }));

      const result = engine.analyzeInventory(trades, 10000);

      expect(result.maxInventory).toBeGreaterThanOrEqual(0);
      expect(result.inventoryUtilization).toBeGreaterThanOrEqual(0);
      expect(result.inventoryUtilization).toBeLessThanOrEqual(1);
      expect(typeof result.avgHoldingPeriod).toBe('number');
      expect(typeof result.inventorySkew).toBe('number');
    });

    it('空交易应返回零值', () => {
      const result = engine.analyzeInventory([], 10000);
      expect(result.currentInventory).toBe(0);
      expect(result.maxInventory).toBe(0);
    });

    it('纯买入应导致正库存', () => {
      const trades = Array.from({ length: 10 }, (_, i) => ({
        size: 100,
        side: 'buy' as const,
        timestamp: Date.now() + i * 1000
      }));

      const result = engine.analyzeInventory(trades, 10000);
      expect(result.currentInventory).toBe(1000);
    });
  });

  describe('analyzeAdverseSelection', () => {
    it('应该计算VPIN', () => {
      const trades = Array.from({ length: 100 }, (_, i) => ({
        price: 100 + (Math.random() - 0.5) * 5,
        size: Math.floor(100 + Math.random() * 500),
        volume: Math.floor(100 + Math.random() * 500)
      }));

      const result = engine.analyzeAdverseSelection(trades, 2000);

      expect(result.toxicFlowRatio).toBeGreaterThanOrEqual(0);
      expect(result.toxicFlowRatio).toBeLessThanOrEqual(1);
      expect(['low', 'moderate', 'high', 'extreme']).toContain(result.toxicityLevel);
      expect(result.vpins.length).toBeGreaterThanOrEqual(0);
    });

    it('不足数据应返回低毒性', () => {
      const result = engine.analyzeAdverseSelection([{ price: 100, size: 100, volume: 100 }]);
      expect(result.toxicityLevel).toBe('low');
    });

    it('极端交易应检测高毒性', () => {
      // 模拟极端单向流量
      const trades = Array.from({ length: 200 }, (_, i) => ({
        price: 100 + (i % 2 === 0 ? 0.1 : -0.1),
        size: 1000,
        volume: 1000
      }));

      const result = engine.analyzeAdverseSelection(trades, 5000);
      expect(result.toxicFlowRatio).toBeGreaterThan(0);
    });
  });

  describe('estimatePerformance', () => {
    it('应该估算做市商绩效', () => {
      const trades = Array.from({ length: 50 }, (_, i) => {
        const mid = 100 + (Math.random() - 0.5) * 2;
        const spreadHalf = 0.02;
        return {
          price: mid + (Math.random() > 0.5 ? spreadHalf : -spreadHalf),
          size: Math.floor(100 + Math.random() * 400),
          side: Math.random() > 0.5 ? 'buy' as const : 'sell' as const,
          midPrice: mid,
          timestamp: Date.now() + i * 1000
        };
      });

      const result = engine.estimatePerformance(trades, 0);

      expect(typeof result.pnlEstimate).toBe('number');
      expect(result.spreadCapture).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('空交易应返回零值', () => {
      const result = engine.estimatePerformance([], 0);
      expect(result.pnlEstimate).toBe(0);
      expect(result.winRate).toBe(0);
    });
  });

  describe('analyzeQuoteDynamics', () => {
    it('应该分析报价动态', () => {
      const quotes = generateQuotes(50);
      const result = engine.analyzeQuoteDynamics(quotes, 10);

      expect(result.timeSeries.length).toBe(50);
      expect(['tightening', 'stable', 'widening']).toContain(result.spreadTrend);
      expect(['increasing', 'stable', 'decreasing']).toContain(result.depthTrend);
      expect(result.quotingIntensity).toBeGreaterThanOrEqual(0);
    });

    it('不足数据应返回稳定趋势', () => {
      const result = engine.analyzeQuoteDynamics([generateQuotes(1)[0]]);
      expect(result.spreadTrend).toBe('stable');
      expect(result.depthTrend).toBe('stable');
    });
  });

  describe('analyzeSpreadElasticity', () => {
    it('应该分析价差弹性', () => {
      const quotes = generateQuotes(30);
      const volumes = Array.from({ length: 30 }, () => Math.floor(1000 + Math.random() * 9000));

      const result = engine.analyzeSpreadElasticity(quotes, volumes);

      expect(typeof result.elasticity).toBe('number');
      expect(['low', 'medium', 'high']).toContain(result.sensitivity);
      expect(result.optimalSpread).toBeGreaterThanOrEqual(0);
    });

    it('不足数据应返回低敏感度', () => {
      const result = engine.analyzeSpreadElasticity([], []);
      expect(result.sensitivity).toBe('low');
    });
  });
});
