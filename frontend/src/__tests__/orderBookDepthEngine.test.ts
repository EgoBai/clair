import { describe, it, expect } from 'vitest';
import {
  calculateDepthImbalance,
  estimateSlippage,
  calculateMarketDepth,
  detectLargeOrders,
  approximateVWAP,
  OrderBook,
} from '../utils/orderBookDepthEngine';

function makeBook(overrides: Partial<OrderBook> = {}): OrderBook {
  return {
    symbol: '000001',
    bids: [
      { price: 10.00, quantity: 500, orders: 10 },
      { price: 9.99, quantity: 300, orders: 5 },
      { price: 9.98, quantity: 200, orders: 3 },
    ],
    asks: [
      { price: 10.01, quantity: 400, orders: 8 },
      { price: 10.02, quantity: 250, orders: 4 },
      { price: 10.03, quantity: 150, orders: 2 },
    ],
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('calculateDepthImbalance', () => {
  it('calculates bid/ask volumes', () => {
    const imbalance = calculateDepthImbalance(makeBook());
    expect(imbalance.bidVolume).toBe(1000);
    expect(imbalance.askVolume).toBe(800);
    expect(imbalance.ratio).toBeGreaterThan(0.5);
  });

  it('calculates spread', () => {
    const imbalance = calculateDepthImbalance(makeBook());
    expect(imbalance.spread).toBe(0.01);
    expect(imbalance.spreadPercent).toBeGreaterThan(0);
  });

  it('handles empty book', () => {
    const imbalance = calculateDepthImbalance(makeBook({ bids: [], asks: [] }));
    expect(imbalance.bidVolume).toBe(0);
    expect(imbalance.askVolume).toBe(0);
  });
});

describe('estimateSlippage', () => {
  it('estimates buy slippage', () => {
    const slip = estimateSlippage(makeBook(), 'buy', 500);
    expect(slip.filledPercent).toBe(100);
    expect(slip.avgSlippage).toBeGreaterThanOrEqual(0);
  });

  it('estimates partial fill', () => {
    const slip = estimateSlippage(makeBook(), 'buy', 2000);
    expect(slip.filledPercent).toBeLessThan(100);
  });

  it('returns zero for zero quantity', () => {
    const slip = estimateSlippage(makeBook(), 'buy', 0);
    expect(slip.filledPercent).toBe(0);
  });

  it('estimates sell slippage', () => {
    const slip = estimateSlippage(makeBook(), 'sell', 500);
    expect(slip.filledPercent).toBe(100);
  });
});

describe('calculateMarketDepth', () => {
  it('returns cumulative depth', () => {
    const depth = calculateMarketDepth(makeBook(), 3);
    expect(depth).toHaveLength(3);
    expect(depth[0].bidCumulative).toBe(500);
    expect(depth[2].bidCumulative).toBe(1000);
  });

  it('respects depth level limit', () => {
    const depth = calculateMarketDepth(makeBook(), 2);
    expect(depth).toHaveLength(2);
  });
});

describe('detectLargeOrders', () => {
  it('detects large orders', () => {
    const book = makeBook({
      bids: [
        { price: 10.00, quantity: 900, orders: 1 },
        { price: 9.99, quantity: 100, orders: 5 },
      ],
    });
    const large = detectLargeOrders(book, 0.1);
    expect(large.length).toBeGreaterThan(0);
    expect(large[0].side).toBe('bid');
  });

  it('returns empty for no large orders', () => {
    const book = makeBook({
      bids: [{ price: 10, quantity: 50, orders: 1 }, { price: 9.99, quantity: 50, orders: 1 }],
      asks: [{ price: 10.01, quantity: 50, orders: 1 }, { price: 10.02, quantity: 50, orders: 1 }],
    });
    const large = detectLargeOrders(book, 0.6);
    expect(large).toHaveLength(0);
  });
});

describe('approximateVWAP', () => {
  it('calculates VWAP for buy', () => {
    const vwap = approximateVWAP(makeBook(), 'buy', 400);
    expect(vwap.vwap).toBe(10.01);
    expect(vwap.levelsUsed).toBe(1);
    expect(vwap.filled).toBe(true);
  });

  it('crosses multiple levels', () => {
    const vwap = approximateVWAP(makeBook(), 'buy', 500);
    expect(vwap.levelsUsed).toBe(2);
    expect(vwap.filled).toBe(true);
  });

  it('handles insufficient liquidity', () => {
    const vwap = approximateVWAP(makeBook(), 'buy', 10000);
    expect(vwap.filled).toBe(false);
  });
});
