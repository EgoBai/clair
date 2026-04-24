import { describe, it, expect } from 'vitest';
import {
  analyzeOrderBookDepth,
  detectLargeOrders,
  volumeAtPrice,
  liquidityDistribution,
  orderBookVWAP,
} from '../utils/marketDepthEngine';
import type { OrderBookSnapshot } from '../utils/marketDepthEngine';

// Helper to create test order book
function createTestOrderBook(): OrderBookSnapshot {
  const bids = Array.from({ length: 10 }, (_, i) => ({
    price: 100 - i * 0.1,
    volume: 1000 + i * 100,
    orders: 5 + i,
  }));

  const asks = Array.from({ length: 10 }, (_, i) => ({
    price: 100.5 + i * 0.1,
    volume: 800 + i * 80,
    orders: 4 + i,
  }));

  return {
    timestamp: Date.now(),
    symbol: '600519.SH',
    bids,
    asks,
    lastPrice: 100.25,
  };
}

describe('Market Depth Analysis Engine', () => {
  const snapshot = createTestOrderBook();

  describe('analyzeOrderBookDepth', () => {
    it('should calculate total bid volume', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(analysis.totalBidVolume).toBeGreaterThan(0);
    });

    it('should calculate total ask volume', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(analysis.totalAskVolume).toBeGreaterThan(0);
    });

    it('should calculate bid-ask ratio', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(analysis.bidAskRatio).toBeGreaterThan(0);
    });

    it('should calculate weighted mid price', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(analysis.weightedMidPrice).toBeGreaterThan(0);
      expect(analysis.weightedMidPrice).toBeCloseTo(100.25, 0);
    });

    it('should calculate spread in bps', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(analysis.spreadBps).toBeGreaterThan(0);
    });

    it('should calculate liquidity score', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(analysis.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(analysis.liquidityScore).toBeLessThanOrEqual(100);
    });

    it('should calculate imbalance between -1 and 1', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(analysis.imbalance).toBeGreaterThanOrEqual(-1);
      expect(analysis.imbalance).toBeLessThanOrEqual(1);
    });

    it('should determine buy/sell pressure', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(['buy', 'sell', 'neutral']).toContain(analysis.pressure);
    });

    it('should find support levels', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(Array.isArray(analysis.supportLevels)).toBe(true);
      analysis.supportLevels.forEach((level) => {
        expect(level.type).toBe('support');
        expect(level.price).toBeGreaterThan(0);
        expect(level.strength).toBeGreaterThan(0);
        expect(level.strength).toBeLessThanOrEqual(1);
      });
    });

    it('should find resistance levels', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      expect(Array.isArray(analysis.resistanceLevels)).toBe(true);
      analysis.resistanceLevels.forEach((level) => {
        expect(level.type).toBe('resistance');
        expect(level.price).toBeGreaterThan(0);
      });
    });

    it('should build depth profile', () => {
      const analysis = analyzeOrderBookDepth(snapshot);
      const { depthProfile } = analysis;

      expect(depthProfile.bidDepth.length).toBe(10);
      expect(depthProfile.askDepth.length).toBe(10);
      expect(depthProfile.cumulativeBid.length).toBe(10);
      expect(depthProfile.cumulativeAsk.length).toBe(10);
    });

    it('should handle empty order book', () => {
      const emptySnapshot: OrderBookSnapshot = {
        timestamp: Date.now(),
        symbol: 'EMPTY',
        bids: [],
        asks: [],
        lastPrice: 100,
      };

      const analysis = analyzeOrderBookDepth(emptySnapshot);
      expect(analysis.totalBidVolume).toBe(0);
      expect(analysis.totalAskVolume).toBe(0);
    });
  });

  describe('detectLargeOrders', () => {
    it('should detect orders significantly larger than average', () => {
      const largeOrderBook = createTestOrderBook();
      largeOrderBook.bids[3] = { price: 99.7, volume: 50000, orders: 1 };

      const alerts = detectLargeOrders(largeOrderBook);
      expect(alerts.length).toBeGreaterThan(0);
      alerts.forEach((alert) => {
        expect(['bid', 'ask']).toContain(alert.side);
        expect(alert.volume).toBeGreaterThan(0);
        expect(alert.significance).toBeGreaterThan(0);
      });
    });

    it('should sort alerts by significance', () => {
      const largeOrderBook = createTestOrderBook();
      largeOrderBook.bids[2] = { price: 99.8, volume: 30000, orders: 1 };
      largeOrderBook.asks[1] = { price: 100.6, volume: 25000, orders: 1 };

      const alerts = detectLargeOrders(largeOrderBook);
      for (let i = 1; i < alerts.length; i++) {
        expect(alerts[i - 1].significance).toBeGreaterThanOrEqual(
          alerts[i].significance
        );
      }
    });

    it('should return empty array for balanced order book', () => {
      const balanced: OrderBookSnapshot = {
        timestamp: Date.now(),
        symbol: 'BAL',
        bids: [{ price: 100, volume: 1000, orders: 5 }],
        asks: [{ price: 100.1, volume: 1000, orders: 5 }],
        lastPrice: 100.05,
      };

      const alerts = detectLargeOrders(balanced);
      expect(alerts.length).toBe(0);
    });
  });

  describe('volumeAtPrice', () => {
    it('should calculate volume near a price level', () => {
      const result = volumeAtPrice(snapshot, 100.25, 100);
      expect(result.bidVolume).toBeGreaterThan(0);
      expect(result.askVolume).toBeGreaterThan(0);
      expect(result.totalVolume).toBe(result.bidVolume + result.askVolume);
    });

    it('should return zero for price far from order book', () => {
      const result = volumeAtPrice(snapshot, 200, 1);
      expect(result.totalVolume).toBe(0);
    });

    it('should handle small price range', () => {
      const result = volumeAtPrice(snapshot, 100, 1);
      expect(result.totalVolume).toBeGreaterThanOrEqual(0);
    });
  });

  describe('liquidityDistribution', () => {
    it('should divide order book into price buckets', () => {
      const dist = liquidityDistribution(snapshot, 5);
      expect(dist.length).toBe(5);

      dist.forEach((bucket) => {
        expect(bucket.priceRange.length).toBe(2);
        expect(bucket.priceRange[1]).toBeGreaterThan(bucket.priceRange[0]);
        expect(bucket.volume).toBeGreaterThanOrEqual(0);
        expect(bucket.percentage).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have percentages that sum to a reasonable value', () => {
      const dist = liquidityDistribution(snapshot, 5);
      const totalPct = dist.reduce((s, b) => s + b.percentage, 0);
      expect(totalPct).toBeGreaterThan(0);
      expect(totalPct).toBeLessThanOrEqual(100);
    });

    it('should return empty for empty order book', () => {
      const emptySnapshot: OrderBookSnapshot = {
        timestamp: Date.now(),
        symbol: 'EMPTY',
        bids: [],
        asks: [],
        lastPrice: 100,
      };

      const dist = liquidityDistribution(emptySnapshot, 5);
      expect(dist.length).toBe(0);
    });
  });

  describe('orderBookVWAP', () => {
    it('should calculate VWAP from order book', () => {
      const vwap = orderBookVWAP(snapshot);
      expect(vwap).toBeGreaterThan(0);
      expect(vwap).toBeCloseTo(100.25, 0);
    });

    it('should return last price for empty order book', () => {
      const emptySnapshot: OrderBookSnapshot = {
        timestamp: Date.now(),
        symbol: 'EMPTY',
        bids: [],
        asks: [],
        lastPrice: 100,
      };

      const vwap = orderBookVWAP(emptySnapshot);
      expect(vwap).toBe(100);
    });
  });
});
