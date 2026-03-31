import { describe, it, expect } from 'vitest';

/**
 * 订单簿分析测试
 */

interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

interface OrderBook {
  symbol: string;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

interface OrderBookMetrics {
  spread: number;
  spreadPercent: number;
  bidDepth: number;
  askDepth: number;
  depthRatio: number;
  midPrice: number;
  weightedMidPrice: number;
  imbalance: number;
  liquidityScore: number;
}

function analyzeOrderBook(book: OrderBook): OrderBookMetrics {
  if (book.bids.length === 0 || book.asks.length === 0) {
    return {
      spread: 0, spreadPercent: 0, bidDepth: 0, askDepth: 0,
      depthRatio: 0, midPrice: 0, weightedMidPrice: 0,
      imbalance: 0, liquidityScore: 0,
    };
  }

  const bestBid = book.bids[0].price;
  const bestAsk = book.asks[0].price;
  const spread = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;
  const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  const bidDepth = book.bids.reduce((s, b) => s + b.quantity, 0);
  const askDepth = book.asks.reduce((s, a) => s + a.quantity, 0);
  const depthRatio = askDepth > 0 ? bidDepth / askDepth : bidDepth;

  const bidValue = book.bids.reduce((s, b) => s + b.price * b.quantity, 0);
  const askValue = book.asks.reduce((s, a) => s + a.price * a.quantity, 0);
  const totalValue = bidValue + askValue;
  const weightedMidPrice = totalValue > 0
    ? (bidValue * bestAsk + askValue * bestBid) / totalValue
    : midPrice;

  const imbalance = (bidDepth + askDepth) > 0
    ? (bidDepth - askDepth) / (bidDepth + askDepth)
    : 0;

  const totalOrders = book.bids.reduce((s, b) => s + b.orders, 0) +
    book.asks.reduce((s, a) => s + a.orders, 0);
  const liquidityScore = Math.min(100, Math.round(
    (totalOrders * 0.3 + (bidDepth + askDepth) * 0.001 + (1 - spreadPercent) * 50)
  ));

  return {
    spread, spreadPercent, bidDepth, askDepth, depthRatio,
    midPrice, weightedMidPrice, imbalance, liquidityScore,
  };
}

function detectSpoofing(book: OrderBook, threshold: number = 5): boolean {
  for (let i = 1; i < book.bids.length; i++) {
    const ratio = book.bids[i].quantity / book.bids[0].quantity;
    if (ratio > threshold && book.bids[i].orders < 3) return true;
  }
  for (let i = 1; i < book.asks.length; i++) {
    const ratio = book.asks[i].quantity / book.asks[0].quantity;
    if (ratio > threshold && book.asks[i].orders < 3) return true;
  }
  return false;
}

function calcIcebergProbability(levels: OrderBookLevel[]): number {
  if (levels.length < 3) return 0;
  const avgQty = levels.reduce((s, l) => s + l.quantity, 0) / levels.length;
  const variance = levels.reduce((s, l) => s + Math.pow(l.quantity - avgQty, 2), 0) / levels.length;
  const cv = avgQty > 0 ? Math.sqrt(variance) / avgQty : 0;
  return Math.min(1, cv);
}

describe('Order Book Analysis', () => {
  const sampleBook: OrderBook = {
    symbol: '000001',
    timestamp: Date.now(),
    bids: [
      { price: 12.50, quantity: 50000, orders: 25 },
      { price: 12.49, quantity: 30000, orders: 15 },
      { price: 12.48, quantity: 20000, orders: 10 },
      { price: 12.47, quantity: 15000, orders: 8 },
      { price: 12.46, quantity: 10000, orders: 5 },
    ],
    asks: [
      { price: 12.51, quantity: 40000, orders: 20 },
      { price: 12.52, quantity: 25000, orders: 12 },
      { price: 12.53, quantity: 18000, orders: 9 },
      { price: 12.54, quantity: 12000, orders: 6 },
      { price: 12.55, quantity: 8000, orders: 4 },
    ],
  };

  describe('订单簿指标', () => {
    it('应该正确计算价差', () => {
      const metrics = analyzeOrderBook(sampleBook);
      expect(metrics.spread).toBeCloseTo(0.01, 2);
    });

    it('应该正确计算中间价', () => {
      const metrics = analyzeOrderBook(sampleBook);
      expect(metrics.midPrice).toBeCloseTo(12.505, 3);
    });

    it('应该正确计算买卖深度', () => {
      const metrics = analyzeOrderBook(sampleBook);
      expect(metrics.bidDepth).toBe(125000);
      expect(metrics.askDepth).toBe(103000);
    });

    it('应该正确计算深度比', () => {
      const metrics = analyzeOrderBook(sampleBook);
      expect(metrics.depthRatio).toBeGreaterThan(1); // 买盘更厚
    });

    it('应该计算不平衡度', () => {
      const metrics = analyzeOrderBook(sampleBook);
      expect(metrics.imbalance).toBeGreaterThan(0); // 买盘多
    });

    it('应该计算流动性评分', () => {
      const metrics = analyzeOrderBook(sampleBook);
      expect(metrics.liquidityScore).toBeGreaterThan(0);
      expect(metrics.liquidityScore).toBeLessThanOrEqual(100);
    });
  });

  describe('空订单簿', () => {
    it('空订单簿应该返回零值', () => {
      const empty: OrderBook = { symbol: '000001', timestamp: Date.now(), bids: [], asks: [] };
      const metrics = analyzeOrderBook(empty);
      expect(metrics.spread).toBe(0);
      expect(metrics.midPrice).toBe(0);
    });
  });

  describe('欺骗检测', () => {
    it('正常订单簿不应该触发', () => {
      expect(detectSpoofing(sampleBook)).toBe(false);
    });

    it('异常大单应该触发', () => {
      const spoofed: OrderBook = {
        ...sampleBook,
        bids: [
          ...sampleBook.bids,
          { price: 12.40, quantity: 500000, orders: 1 },
        ],
      };
      expect(detectSpoofing(spoofed)).toBe(true);
    });
  });

  describe('冰山概率', () => {
    it('均匀分布应该低概率', () => {
      const levels: OrderBookLevel[] = [
        { price: 10, quantity: 100, orders: 5 },
        { price: 10, quantity: 100, orders: 5 },
        { price: 10, quantity: 100, orders: 5 },
      ];
      expect(calcIcebergProbability(levels)).toBe(0);
    });

    it('空数据应该返回0', () => {
      expect(calcIcebergProbability([])).toBe(0);
    });
  });
});
