import { describe, it, expect } from 'vitest';
import {
  calculateBidAskSpread,
  calculateMidPrice,
  calculateWeightedMidPrice,
  calculateOrderBookImbalance,
  calculateDepth,
  calculateLiquidityMetrics,
  calculateVolumeProfile,
  calculateOrderFlowImbalance,
  estimateMarketImpact,
  calculateTWAP,
  calculateVWAP,
  classifyTradeDirection,
  calculateKyleLambda,
  calculateAmihudIlliquidity,
  calculateRollSpread,
  type OrderBook,
  type OrderBookLevel,
  type TradeTick,
} from '../utils/marketMicrostructureEngine';

const mockBids: OrderBookLevel[] = [
  { price: 10.00, quantity: 500, orders: 5 },
  { price: 9.99, quantity: 800, orders: 8 },
  { price: 9.98, quantity: 1200, orders: 12 },
  { price: 9.97, quantity: 600, orders: 6 },
  { price: 9.96, quantity: 400, orders: 4 },
];

const mockAsks: OrderBookLevel[] = [
  { price: 10.01, quantity: 400, orders: 4 },
  { price: 10.02, quantity: 700, orders: 7 },
  { price: 10.03, quantity: 1000, orders: 10 },
  { price: 10.04, quantity: 500, orders: 5 },
  { price: 10.05, quantity: 300, orders: 3 },
];

const mockOrderBook: OrderBook = {
  symbol: 'TEST',
  timestamp: Date.now(),
  bids: mockBids,
  asks: mockAsks,
};

const mockTicks: TradeTick[] = [
  { timestamp: 1000, price: 10.00, quantity: 100, direction: 'buy', aggressor: 'ask' },
  { timestamp: 2000, price: 10.01, quantity: 200, direction: 'buy', aggressor: 'ask' },
  { timestamp: 3000, price: 10.00, quantity: 150, direction: 'sell', aggressor: 'bid' },
  { timestamp: 4000, price: 9.99, quantity: 300, direction: 'sell', aggressor: 'bid' },
  { timestamp: 5000, price: 10.01, quantity: 250, direction: 'buy', aggressor: 'ask' },
  { timestamp: 6000, price: 10.02, quantity: 100, direction: 'buy', aggressor: 'ask' },
];

describe('calculateBidAskSpread', () => {
  it('should calculate spread', () => {
    const spread = calculateBidAskSpread(mockBids, mockAsks);
    expect(spread).toBeCloseTo(0.01, 5);
  });

  it('should return 0 for empty books', () => {
    expect(calculateBidAskSpread([], mockAsks)).toBe(0);
    expect(calculateBidAskSpread(mockBids, [])).toBe(0);
  });
});

describe('calculateMidPrice', () => {
  it('should calculate mid price', () => {
    const mid = calculateMidPrice(mockBids, mockAsks);
    expect(mid).toBeCloseTo(10.005, 5);
  });

  it('should return 0 for empty books', () => {
    expect(calculateMidPrice([], [])).toBe(0);
  });
});

describe('calculateWeightedMidPrice', () => {
  it('should calculate weighted mid price', () => {
    const wmid = calculateWeightedMidPrice(mockBids, mockAsks);
    expect(wmid).toBeGreaterThan(mockBids[0].price);
    expect(wmid).toBeLessThan(mockAsks[0].price);
  });

  it('should fall back to mid when quantities are zero', () => {
    const emptyBids: OrderBookLevel[] = [{ price: 10, quantity: 0, orders: 0 }];
    const emptyAsks: OrderBookLevel[] = [{ price: 10.01, quantity: 0, orders: 0 }];
    const wmid = calculateWeightedMidPrice(emptyBids, emptyAsks);
    expect(wmid).toBeCloseTo(10.005, 5);
  });
});

describe('calculateOrderBookImbalance', () => {
  it('should calculate imbalance', () => {
    const imbalance = calculateOrderBookImbalance(mockBids, mockAsks);
    expect(imbalance).toBeGreaterThan(-1);
    expect(imbalance).toBeLessThan(1);
  });

  it('should return 0 for empty books', () => {
    expect(calculateOrderBookImbalance([], [])).toBe(0);
  });
});

describe('calculateDepth', () => {
  it('should calculate depth at specified levels', () => {
    const depth = calculateDepth(mockBids, mockAsks, 3);
    expect(depth.bidDepth).toBe(500 + 800 + 1200);
    expect(depth.askDepth).toBe(400 + 700 + 1000);
    expect(depth.totalDepth).toBe(depth.bidDepth + depth.askDepth);
  });
});

describe('calculateLiquidityMetrics', () => {
  it('should calculate comprehensive liquidity metrics', () => {
    const metrics = calculateLiquidityMetrics(mockOrderBook);
    expect(metrics.bidAskSpread).toBeCloseTo(0.01, 5);
    expect(metrics.bidAskSpreadPercent).toBeGreaterThan(0);
    expect(metrics.bidDepth).toBeGreaterThan(0);
    expect(metrics.askDepth).toBeGreaterThan(0);
    expect(metrics.liquidityScore).toBeGreaterThanOrEqual(0);
    expect(metrics.liquidityScore).toBeLessThanOrEqual(100);
  });
});

describe('calculateVolumeProfile', () => {
  it('should calculate volume profile', () => {
    const profile = calculateVolumeProfile(mockTicks, 0.01);
    expect(profile.length).toBeGreaterThan(0);
    const poc = profile.find(p => p.poc);
    expect(poc).toBeDefined();
    expect(poc!.volume).toBeGreaterThan(0);
  });

  it('should return empty for no ticks', () => {
    expect(calculateVolumeProfile([])).toEqual([]);
  });

  it('should have value area', () => {
    const profile = calculateVolumeProfile(mockTicks);
    if (profile.length > 0) {
      expect(profile[0].valueAreaHigh).toBeGreaterThanOrEqual(profile[0].valueAreaLow);
    }
  });
});

describe('calculateOrderFlowImbalance', () => {
  it('should calculate order flow imbalance', () => {
    const flow = calculateOrderFlowImbalance(mockTicks, 3);
    expect(flow.length).toBeGreaterThan(0);
    flow.forEach(f => {
      expect(f.buyVolume).toBeGreaterThanOrEqual(0);
      expect(f.sellVolume).toBeGreaterThanOrEqual(0);
      expect(f.netFlow).toBe(f.buyVolume - f.sellVolume);
    });
  });

  it('should return empty for no ticks', () => {
    expect(calculateOrderFlowImbalance([])).toEqual([]);
  });

  it('should track cumulative flow', () => {
    const flow = calculateOrderFlowImbalance(mockTicks, 3);
    if (flow.length > 1) {
      expect(flow[flow.length - 1].cumulativeFlow).toBe(
        flow.reduce((s, f) => s + f.netFlow, 0)
      );
    }
  });
});

describe('estimateMarketImpact', () => {
  it('should estimate market impact', () => {
    const impact = estimateMarketImpact(10000, 1000000, 0.02, 0.01);
    expect(impact.temporaryImpact).toBeGreaterThan(0);
    expect(impact.permanentImpact).toBeGreaterThanOrEqual(0);
    expect(impact.totalImpact).toBeGreaterThan(0);
    expect(impact.participationRate).toBeCloseTo(0.01, 5);
  });

  it('should handle zero daily volume', () => {
    const impact = estimateMarketImpact(100, 0, 0.02, 0.01);
    expect(impact.participationRate).toBe(0);
  });
});

describe('calculateTWAP', () => {
  it('should calculate TWAP', () => {
    const result = calculateTWAP(mockTicks, 1000, 0, 10000, 5);
    expect(result.slices.length).toBe(5);
    expect(result.averagePrice).toBeGreaterThan(0);
    expect(result.totalQuantity).toBe(1000);
  });
});

describe('calculateVWAP', () => {
  it('should calculate VWAP', () => {
    const result = calculateVWAP(mockTicks);
    expect(result.averagePrice).toBeGreaterThan(0);
    expect(result.totalVolume).toBe(
      mockTicks.reduce((s, t) => s + t.quantity, 0)
    );
  });

  it('should filter by time range', () => {
    const result = calculateVWAP(mockTicks, 2000, 5000);
    expect(result.totalVolume).toBeLessThan(
      mockTicks.reduce((s, t) => s + t.quantity, 0)
    );
  });
});

describe('classifyTradeDirection', () => {
  it('should classify at ask as buy', () => {
    expect(classifyTradeDirection(
      { timestamp: 0, price: 10.01, quantity: 100, direction: 'unknown', aggressor: 'unknown' },
      10.00, 10.01
    )).toBe('buy');
  });

  it('should classify at bid as sell', () => {
    expect(classifyTradeDirection(
      { timestamp: 0, price: 10.00, quantity: 100, direction: 'unknown', aggressor: 'unknown' },
      10.00, 10.01
    )).toBe('sell');
  });

  it('should classify mid-price trades', () => {
    const result = classifyTradeDirection(
      { timestamp: 0, price: 10.005, quantity: 100, direction: 'unknown', aggressor: 'unknown' },
      10.00, 10.01
    );
    expect(['buy', 'sell', 'unknown']).toContain(result);
  });
});

describe('calculateKyleLambda', () => {
  it('should calculate Kyle lambda', () => {
    const lambda = calculateKyleLambda(mockTicks);
    expect(typeof lambda).toBe('number');
  });

  it('should return 0 for insufficient data', () => {
    expect(calculateKyleLambda([mockTicks[0]])).toBe(0);
  });
});

describe('calculateAmihudIlliquidity', () => {
  it('should calculate Amihud illiquidity ratio', () => {
    const prices = [10, 10.01, 9.99, 10.02, 10.00];
    const volumes = [10000, 15000, 12000, 18000, 14000];
    const illiq = calculateAmihudIlliquidity(prices, volumes);
    expect(illiq).toBeGreaterThan(0);
  });

  it('should return 0 for insufficient data', () => {
    expect(calculateAmihudIlliquidity([10], [1000])).toBe(0);
  });
});

describe('calculateRollSpread', () => {
  it('should calculate Roll spread', () => {
    const prices = [10, 10.01, 10.00, 9.99, 10.01, 10.02, 10.00, 9.98, 10.01];
    const spread = calculateRollSpread(prices);
    expect(typeof spread).toBe('number');
    expect(spread).toBeGreaterThanOrEqual(0);
  });

  it('should return 0 for insufficient data', () => {
    expect(calculateRollSpread([10, 10.01])).toBe(0);
  });
});
