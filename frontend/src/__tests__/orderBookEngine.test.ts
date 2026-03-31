import { describe, it, expect } from 'vitest';
import { analyzeOrderBook, orderFlowImbalance, OrderBook } from '../utils/orderBookEngine';

describe('盘口订单簿引擎', () => {
  const book: OrderBook = {
    bids: [
      { price: 100, quantity: 500 },
      { price: 99.5, quantity: 800 },
      { price: 99, quantity: 1200 },
      { price: 98.5, quantity: 600 },
      { price: 98, quantity: 400 },
    ],
    asks: [
      { price: 100.5, quantity: 400 },
      { price: 101, quantity: 600 },
      { price: 101.5, quantity: 1000 },
      { price: 102, quantity: 500 },
      { price: 102.5, quantity: 300 },
    ],
    timestamp: Date.now(),
  };

  describe('analyzeOrderBook', () => {
    it('should calculate spread', () => {
      const result = analyzeOrderBook(book);
      expect(result.spread).toBe(0.5);
      expect(result.spreadPct).toBeGreaterThan(0);
    });

    it('should calculate imbalance', () => {
      const result = analyzeOrderBook(book);
      expect(result.imbalance).toBeGreaterThan(-1);
      expect(result.imbalance).toBeLessThan(1);
    });

    it('should determine pressure', () => {
      const result = analyzeOrderBook(book);
      expect(['buy', 'sell', 'neutral']).toContain(result.pressure);
    });

    it('should calculate weighted mid price', () => {
      const result = analyzeOrderBook(book);
      expect(result.weightedMidPrice).toBeGreaterThan(100);
      expect(result.weightedMidPrice).toBeLessThan(100.5);
    });

    it('should find support levels', () => {
      const result = analyzeOrderBook(book);
      expect(result.supportLevels.length).toBeGreaterThanOrEqual(0);
    });

    it('should find resistance levels', () => {
      const result = analyzeOrderBook(book);
      expect(result.resistanceLevels.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty book', () => {
      const result = analyzeOrderBook({ bids: [], asks: [], timestamp: 0 });
      expect(result.spread).toBe(0);
      expect(result.pressure).toBe('neutral');
    });

    it('should calculate liquidity score', () => {
      const result = analyzeOrderBook(book);
      expect(result.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(result.liquidityScore).toBeLessThanOrEqual(100);
    });
  });

  describe('orderFlowImbalance', () => {
    const books: OrderBook[] = Array.from({ length: 20 }, (_, i) => ({
      bids: [{ price: 100, quantity: 500 + i * 10 }],
      asks: [{ price: 100.5, quantity: 400 }],
      timestamp: i,
    }));

    it('should calculate current imbalance', () => {
      const result = orderFlowImbalance(books);
      expect(result.currentImbalance).toBeDefined();
    });

    it('should determine trend', () => {
      const result = orderFlowImbalance(books);
      expect(['increasing_buy', 'increasing_sell', 'stable']).toContain(result.trend);
    });

    it('should handle empty input', () => {
      const result = orderFlowImbalance([]);
      expect(result.currentImbalance).toBe(0);
      expect(result.trend).toBe('stable');
    });
  });
});
