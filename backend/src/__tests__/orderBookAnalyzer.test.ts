import { describe, it, expect, beforeEach } from 'vitest';
import { OrderBookAnalyzer, OrderBook, OrderBookLevel } from '../services/orderBookAnalyzer';

describe('OrderBookAnalyzer', () => {
  let analyzer: OrderBookAnalyzer;

  beforeEach(() => {
    analyzer = new OrderBookAnalyzer();
  });

  const makeOrderBook = (overrides: Partial<OrderBook> = {}): OrderBook => ({
    stockCode: '600519',
    timestamp: new Date().toISOString(),
    bids: [
      { price: 100.00, quantity: 5000, orderCount: 10 },
      { price: 99.99, quantity: 8000, orderCount: 15 },
      { price: 99.98, quantity: 3000, orderCount: 5 },
      { price: 99.97, quantity: 12000, orderCount: 20 },
      { price: 99.96, quantity: 2000, orderCount: 3 }
    ],
    asks: [
      { price: 100.01, quantity: 4000, orderCount: 8 },
      { price: 100.02, quantity: 6000, orderCount: 12 },
      { price: 100.03, quantity: 5000, orderCount: 9 },
      { price: 100.04, quantity: 10000, orderCount: 18 },
      { price: 100.05, quantity: 3000, orderCount: 5 }
    ],
    ...overrides
  });

  describe('addOrderBook', () => {
    it('should add order book snapshot', () => {
      analyzer.addOrderBook(makeOrderBook());
      const book = analyzer.getOrderBook('600519');
      expect(book).toBeDefined();
      expect(book!.stockCode).toBe('600519');
    });

    it('should track multiple snapshots', () => {
      analyzer.addOrderBook(makeOrderBook({ timestamp: '2024-01-01T09:30:00Z' }));
      analyzer.addOrderBook(makeOrderBook({ timestamp: '2024-01-01T09:31:00Z' }));
      
      const book = analyzer.getOrderBook('600519');
      expect(book!.timestamp).toBe('2024-01-01T09:31:00Z');
    });

    it('should handle different stocks separately', () => {
      analyzer.addOrderBook(makeOrderBook({ stockCode: '600519' }));
      analyzer.addOrderBook(makeOrderBook({ stockCode: '000858' }));
      
      expect(analyzer.getOrderBook('600519')!.stockCode).toBe('600519');
      expect(analyzer.getOrderBook('000858')!.stockCode).toBe('000858');
    });
  });

  describe('getOrderBook', () => {
    it('should return undefined for unknown stock', () => {
      expect(analyzer.getOrderBook('UNKNOWN')).toBeUndefined();
    });

    it('should return latest snapshot', () => {
      analyzer.addOrderBook(makeOrderBook({ timestamp: '2024-01-01T09:30:00Z' }));
      analyzer.addOrderBook(makeOrderBook({ timestamp: '2024-01-01T09:35:00Z' }));
      
      expect(analyzer.getOrderBook('600519')!.timestamp).toBe('2024-01-01T09:35:00Z');
    });
  });

  describe('analyzeImbalance', () => {
    it('should calculate bid/ask volumes', () => {
      analyzer.addOrderBook(makeOrderBook());
      const imbalance = analyzer.analyzeImbalance('600519');
      
      expect(imbalance).toBeDefined();
      expect(imbalance!.bidVolume).toBe(5000 + 8000 + 3000 + 12000 + 2000);
      expect(imbalance!.askVolume).toBe(4000 + 6000 + 5000 + 10000 + 3000);
    });

    it('should calculate imbalance ratio', () => {
      analyzer.addOrderBook(makeOrderBook());
      const imbalance = analyzer.analyzeImbalance('600519');
      
      expect(imbalance!.imbalanceRatio).toBeGreaterThan(0);
      expect(typeof imbalance!.imbalanceRatio).toBe('number');
    });

    it('should calculate spread', () => {
      analyzer.addOrderBook(makeOrderBook());
      const imbalance = analyzer.analyzeImbalance('600519');
      
      expect(imbalance!.spread).toBeCloseTo(0.01, 2);
      expect(imbalance!.spreadPercent).toBeGreaterThan(0);
    });

    it('should calculate weighted mid price', () => {
      analyzer.addOrderBook(makeOrderBook());
      const imbalance = analyzer.analyzeImbalance('600519');
      
      expect(imbalance!.weightedMidPrice).toBeGreaterThan(99);
      expect(imbalance!.weightedMidPrice).toBeLessThan(101);
    });

    it('should calculate liquidity score 0-100', () => {
      analyzer.addOrderBook(makeOrderBook());
      const imbalance = analyzer.analyzeImbalance('600519');
      
      expect(imbalance!.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(imbalance!.liquidityScore).toBeLessThanOrEqual(100);
    });

    it('should return undefined for unknown stock', () => {
      expect(analyzer.analyzeImbalance('UNKNOWN')).toBeUndefined();
    });

    it('should handle heavy buy side', () => {
      analyzer.addOrderBook(makeOrderBook({
        bids: [
          { price: 100, quantity: 100000, orderCount: 50 },
          { price: 99, quantity: 80000, orderCount: 40 }
        ],
        asks: [
          { price: 101, quantity: 1000, orderCount: 2 },
          { price: 102, quantity: 2000, orderCount: 3 }
        ]
      }));
      
      const imbalance = analyzer.analyzeImbalance('600519');
      expect(imbalance!.imbalanceRatio).toBeGreaterThan(10);
    });

    it('should handle heavy sell side', () => {
      analyzer.addOrderBook(makeOrderBook({
        bids: [
          { price: 100, quantity: 1000, orderCount: 2 }
        ],
        asks: [
          { price: 101, quantity: 50000, orderCount: 30 },
          { price: 102, quantity: 60000, orderCount: 35 }
        ]
      }));
      
      const imbalance = analyzer.analyzeImbalance('600519');
      expect(imbalance!.imbalanceRatio).toBeLessThan(0.2);
    });
  });

  describe('detectLargeOrders', () => {
    it('should detect orders above threshold', () => {
      analyzer.setLargeOrderThreshold(5000);
      analyzer.addOrderBook(makeOrderBook());
      
      const largeOrders = analyzer.detectLargeOrders('600519');
      expect(largeOrders.length).toBeGreaterThan(0);
      largeOrders.forEach(o => {
        expect(o.quantity).toBeGreaterThanOrEqual(5000);
      });
    });

    it('should return empty when no large orders', () => {
      analyzer.setLargeOrderThreshold(9999999);
      analyzer.addOrderBook(makeOrderBook());
      
      expect(analyzer.detectLargeOrders('600519')).toHaveLength(0);
    });

    it('should return empty for unknown stock', () => {
      expect(analyzer.detectLargeOrders('UNKNOWN')).toHaveLength(0);
    });

    it('should sort by quantity descending', () => {
      analyzer.setLargeOrderThreshold(1000);
      analyzer.addOrderBook(makeOrderBook());
      
      const largeOrders = analyzer.detectLargeOrders('600519');
      for (let i = 1; i < largeOrders.length; i++) {
        expect(largeOrders[i - 1].quantity).toBeGreaterThanOrEqual(largeOrders[i].quantity);
      }
    });

    it('should identify bid and ask sides', () => {
      analyzer.setLargeOrderThreshold(5000);
      analyzer.addOrderBook(makeOrderBook());
      
      const largeOrders = analyzer.detectLargeOrders('600519');
      const sides = new Set(largeOrders.map(o => o.side));
      // At least some should have valid sides
      sides.forEach(s => expect(['bid', 'ask']).toContain(s));
    });
  });

  describe('analyzeOrderFlow', () => {
    it('should require at least 2 snapshots', () => {
      analyzer.addOrderBook(makeOrderBook());
      expect(analyzer.analyzeOrderFlow('600519')).toBeUndefined();
    });

    it('should calculate buy/sell pressure', () => {
      analyzer.addOrderBook(makeOrderBook());
      analyzer.addOrderBook(makeOrderBook());
      
      const flow = analyzer.analyzeOrderFlow('600519');
      expect(flow).toBeDefined();
      expect(flow!.buyPressure).toBeGreaterThan(0);
      expect(flow!.sellPressure).toBeGreaterThan(0);
    });

    it('should calculate net pressure', () => {
      analyzer.addOrderBook(makeOrderBook());
      analyzer.addOrderBook(makeOrderBook());
      
      const flow = analyzer.analyzeOrderFlow('600519');
      expect(flow!.netPressure).toBe(flow!.buyPressure - flow!.sellPressure);
    });

    it('should calculate VWAP', () => {
      analyzer.addOrderBook(makeOrderBook());
      analyzer.addOrderBook(makeOrderBook());
      
      const flow = analyzer.analyzeOrderFlow('600519');
      expect(flow!.vwap).toBeGreaterThan(0);
    });

    it('should calculate TWAP', () => {
      analyzer.addOrderBook(makeOrderBook());
      analyzer.addOrderBook(makeOrderBook());
      
      const flow = analyzer.analyzeOrderFlow('600519');
      expect(flow!.twap).toBeGreaterThan(0);
    });

    it('should return undefined for unknown stock', () => {
      expect(analyzer.analyzeOrderFlow('UNKNOWN')).toBeUndefined();
    });
  });

  describe('getMarketImpact', () => {
    it('should calculate market impact for buy', () => {
      analyzer.addOrderBook(makeOrderBook());
      const impact = analyzer.getMarketImpact('600519', 'buy', 1000);
      
      expect(impact).toBeGreaterThanOrEqual(0);
      expect(impact).toBeLessThan(0.1);
    });

    it('should calculate market impact for sell', () => {
      analyzer.addOrderBook(makeOrderBook());
      const impact = analyzer.getMarketImpact('600519', 'sell', 1000);
      
      expect(impact).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for unknown stock', () => {
      expect(analyzer.getMarketImpact('UNKNOWN', 'buy', 1000)).toBe(0);
    });

    it('should return Infinity when insufficient liquidity', () => {
      analyzer.addOrderBook(makeOrderBook());
      const impact = analyzer.getMarketImpact('600519', 'buy', 999999999);
      
      expect(impact).toBe(Infinity);
    });

    it('should increase with larger orders', () => {
      analyzer.addOrderBook(makeOrderBook());
      const smallImpact = analyzer.getMarketImpact('600519', 'buy', 100);
      const largeImpact = analyzer.getMarketImpact('600519', 'buy', 5000);
      
      expect(largeImpact).toBeGreaterThanOrEqual(smallImpact);
    });
  });

  describe('edge cases', () => {
    it('should handle empty order book', () => {
      analyzer.addOrderBook(makeOrderBook({ bids: [], asks: [] }));
      const imbalance = analyzer.analyzeImbalance('600519');
      
      expect(imbalance!.bidVolume).toBe(0);
      expect(imbalance!.askVolume).toBe(0);
    });

    it('should handle single level order book', () => {
      analyzer.addOrderBook(makeOrderBook({
        bids: [{ price: 100, quantity: 1000, orderCount: 5 }],
        asks: [{ price: 101, quantity: 1000, orderCount: 5 }]
      }));
      
      const imbalance = analyzer.analyzeImbalance('600519');
      expect(imbalance!.depth).toBe(1);
    });

    it('should handle equal bid/ask volumes', () => {
      analyzer.addOrderBook(makeOrderBook({
        bids: [{ price: 100, quantity: 5000, orderCount: 10 }],
        asks: [{ price: 101, quantity: 5000, orderCount: 10 }]
      }));
      
      const imbalance = analyzer.analyzeImbalance('600519');
      expect(imbalance!.imbalanceRatio).toBeCloseTo(1, 1);
    });
  });
});
