import { describe, it, expect } from 'vitest';
import {
  analyzeTradeCosts,
  detectInformationAsymmetry,
  analyzePriceDiscovery,
  analyzeBlockTradeImpact,
  analyzeTradeSizeDistribution,
} from '../utils/marketMicrostructureV2Engine';
import type { TradeData } from '../utils/marketMicrostructureV2Engine';

function createTrade(overrides: Partial<TradeData> = {}): TradeData {
  return {
    timestamp: Date.now(),
    price: 100 + Math.random() * 2,
    volume: Math.floor(Math.random() * 5000) + 100,
    side: Math.random() > 0.5 ? 'buy' : 'sell',
    isBlock: false,
    ...overrides,
  };
}

function createTradeSequence(count: number): TradeData[] {
  let price = 100;
  return Array.from({ length: count }, (_, i) => {
    price += (Math.random() - 0.5) * 0.5;
    return createTrade({
      timestamp: Date.now() + i * 1000,
      price,
      volume: Math.floor(Math.random() * 3000) + 100,
    });
  });
}

describe('Market Microstructure V2 Engine', () => {
  const trades = createTradeSequence(20);

  describe('analyzeTradeCosts', () => {
    it('should calculate effective spread', () => {
      const costs = analyzeTradeCosts(trades, 100);
      expect(typeof costs.effectiveSpread).toBe('number');
    });

    it('should calculate realized spread', () => {
      const costs = analyzeTradeCosts(trades, 100);
      expect(typeof costs.realizedSpread).toBe('number');
    });

    it('should calculate price impact', () => {
      const costs = analyzeTradeCosts(trades, 100);
      expect(typeof costs.priceImpact).toBe('number');
    });

    it('should calculate implementation shortfall', () => {
      const costs = analyzeTradeCosts(trades, 100);
      expect(typeof costs.implementationShortfall).toBe('number');
    });

    it('should calculate cost in bps', () => {
      const costs = analyzeTradeCosts(trades, 100);
      expect(costs.costBps).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty trades', () => {
      const costs = analyzeTradeCosts([], 100);
      expect(costs.effectiveSpread).toBe(0);
      expect(costs.costBps).toBe(0);
    });
  });

  describe('detectInformationAsymmetry', () => {
    it('should detect buy/sell imbalance', () => {
      const asymmetry = detectInformationAsymmetry(trades);
      expect(asymmetry.pinScore).toBeGreaterThanOrEqual(0);
      expect(asymmetry.pinScore).toBeLessThanOrEqual(1);
    });

    it('should classify toxicity', () => {
      const asymmetry = detectInformationAsymmetry(trades);
      expect(['high', 'medium', 'low']).toContain(asymmetry.toxicity);
    });

    it('should handle insufficient data', () => {
      const asymmetry = detectInformationAsymmetry([createTrade()]);
      expect(asymmetry.pinScore).toBe(0);
      expect(asymmetry.toxicity).toBe('low');
    });
  });

  describe('analyzePriceDiscovery', () => {
    it('should calculate price efficiency', () => {
      const prices = [100, 101, 100.5, 101.5, 100.8, 101.2];
      const discovery = analyzePriceDiscovery(prices);
      expect(discovery.efficiency).toBeGreaterThanOrEqual(0);
      expect(discovery.efficiency).toBeLessThanOrEqual(1);
    });

    it('should calculate half-life', () => {
      const prices = [100, 101, 100.5, 101.5, 100.8, 101.2];
      const discovery = analyzePriceDiscovery(prices);
      expect(typeof discovery.halfLife).toBe('number');
    });

    it('should calculate noise level', () => {
      const prices = [100, 101, 100.5, 101.5, 100.8, 101.2];
      const discovery = analyzePriceDiscovery(prices);
      expect(discovery.noiseLevel).toBeGreaterThan(0);
    });

    it('should return discovery score', () => {
      const prices = [100, 101, 100.5, 101.5, 100.8, 101.2];
      const discovery = analyzePriceDiscovery(prices);
      expect(discovery.discoveryScore).toBeGreaterThanOrEqual(0);
      expect(discovery.discoveryScore).toBeLessThanOrEqual(100);
    });

    it('should handle insufficient data', () => {
      const discovery = analyzePriceDiscovery([100, 101]);
      expect(discovery.efficiency).toBe(0);
    });
  });

  describe('analyzeBlockTradeImpact', () => {
    it('should analyze block trade impact', () => {
      const tradesWithBlock = [
        createTrade({ timestamp: 1, price: 100 }),
        createTrade({ timestamp: 2, price: 100.1 }),
        createTrade({ timestamp: 3, price: 100.5, isBlock: true, volume: 50000 }),
        createTrade({ timestamp: 4, price: 101 }),
        createTrade({ timestamp: 5, price: 100.8 }),
      ];
      const impact = analyzeBlockTradeImpact(tradesWithBlock);
      expect(typeof impact.impact).toBe('number');
      expect(impact.preBlockPrice).toBeGreaterThan(0);
      expect(impact.postBlockPrice).toBeGreaterThan(0);
    });

    it('should handle no block trades', () => {
      const impact = analyzeBlockTradeImpact(trades);
      expect(impact.impact).toBe(0);
    });
  });

  describe('analyzeTradeSizeDistribution', () => {
    it('should calculate distribution statistics', () => {
      const dist = analyzeTradeSizeDistribution(trades);
      expect(dist.mean).toBeGreaterThan(0);
      expect(dist.median).toBeGreaterThan(0);
      expect(typeof dist.skewness).toBe('number');
      expect(typeof dist.kurtosis).toBe('number');
    });

    it('should handle empty trades', () => {
      const dist = analyzeTradeSizeDistribution([]);
      expect(dist.mean).toBe(0);
      expect(dist.median).toBe(0);
    });
  });
});
