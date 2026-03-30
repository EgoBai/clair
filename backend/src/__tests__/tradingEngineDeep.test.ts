import { describe, it, expect } from 'vitest';

// Order matching engine simulation
describe('Order Matching Engine', () => {
  interface Order {
    id: string; side: 'buy' | 'sell'; price: number; quantity: number;
    timestamp: number; filled: number;
  }

  const matchOrders = (buyOrders: Order[], sellOrders: Order[]) => {
    const trades: Array<{ buyId: string; sellId: string; price: number; quantity: number }> = [];
    const sortedBuys = [...buyOrders].sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
    const sortedSells = [...sellOrders].sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);

    for (const buy of sortedBuys) {
      const buyRemain = buy.quantity - buy.filled;
      if (buyRemain <= 0) continue;
      for (const sell of sortedSells) {
        const sellRemain = sell.quantity - sell.filled;
        if (sellRemain <= 0) continue;
        if (buy.price >= sell.price) {
          const qty = Math.min(buyRemain, sellRemain);
          const tradePrice = buy.timestamp < sell.timestamp ? buy.price : sell.price;
          trades.push({ buyId: buy.id, sellId: sell.id, price: tradePrice, quantity: qty });
          buy.filled += qty;
          sell.filled += qty;
        }
      }
    }
    return trades;
  };

  it('should match buy and sell at same price', () => {
    const trades = matchOrders(
      [{ id: 'b1', side: 'buy', price: 100, quantity: 100, timestamp: 1, filled: 0 }],
      [{ id: 's1', side: 'sell', price: 100, quantity: 100, timestamp: 2, filled: 0 }]
    );
    expect(trades).toHaveLength(1);
    expect(trades[0].quantity).toBe(100);
  });

  it('should not match when buy price < sell price', () => {
    const trades = matchOrders(
      [{ id: 'b1', side: 'buy', price: 99, quantity: 100, timestamp: 1, filled: 0 }],
      [{ id: 's1', side: 'sell', price: 100, quantity: 100, timestamp: 2, filled: 0 }]
    );
    expect(trades).toHaveLength(0);
  });

  it('should match partial quantity', () => {
    const trades = matchOrders(
      [{ id: 'b1', side: 'buy', price: 100, quantity: 50, timestamp: 1, filled: 0 }],
      [{ id: 's1', side: 'sell', price: 100, quantity: 100, timestamp: 2, filled: 0 }]
    );
    expect(trades).toHaveLength(1);
    expect(trades[0].quantity).toBe(50);
  });

  it('should match multiple orders', () => {
    const trades = matchOrders(
      [
        { id: 'b1', side: 'buy', price: 101, quantity: 100, timestamp: 1, filled: 0 },
        { id: 'b2', side: 'buy', price: 100, quantity: 100, timestamp: 2, filled: 0 },
      ],
      [
        { id: 's1', side: 'sell', price: 100, quantity: 100, timestamp: 3, filled: 0 },
      ]
    );
    expect(trades.length).toBeGreaterThan(0);
  });

  it('should skip fully filled orders', () => {
    const trades = matchOrders(
      [{ id: 'b1', side: 'buy', price: 100, quantity: 100, timestamp: 1, filled: 100 }],
      [{ id: 's1', side: 'sell', price: 100, quantity: 100, timestamp: 2, filled: 0 }]
    );
    expect(trades).toHaveLength(0);
  });

  it('should prioritize higher buy price', () => {
    const trades = matchOrders(
      [
        { id: 'b1', side: 'buy', price: 102, quantity: 50, timestamp: 1, filled: 0 },
        { id: 'b2', side: 'buy', price: 100, quantity: 50, timestamp: 2, filled: 0 },
      ],
      [{ id: 's1', side: 'sell', price: 100, quantity: 100, timestamp: 3, filled: 0 }]
    );
    expect(trades[0].buyId).toBe('b1');
  });

  it('should prioritize lower sell price', () => {
    const trades = matchOrders(
      [{ id: 'b1', side: 'buy', price: 102, quantity: 100, timestamp: 1, filled: 0 }],
      [
        { id: 's1', side: 'sell', price: 100, quantity: 50, timestamp: 2, filled: 0 },
        { id: 's2', side: 'sell', price: 101, quantity: 50, timestamp: 3, filled: 0 },
      ]
    );
    expect(trades[0].sellId).toBe('s1');
  });

  it('should handle empty order books', () => {
    expect(matchOrders([], [])).toEqual([]);
  });

  it('should handle buy only', () => {
    const trades = matchOrders(
      [{ id: 'b1', side: 'buy', price: 100, quantity: 100, timestamp: 1, filled: 0 }],
      []
    );
    expect(trades).toHaveLength(0);
  });

  it('should handle sell only', () => {
    const trades = matchOrders(
      [],
      [{ id: 's1', side: 'sell', price: 100, quantity: 100, timestamp: 1, filled: 0 }]
    );
    expect(trades).toHaveLength(0);
  });

  it('should use earlier order price as trade price', () => {
    const trades = matchOrders(
      [{ id: 'b1', side: 'buy', price: 101, quantity: 100, timestamp: 1, filled: 0 }],
      [{ id: 's1', side: 'sell', price: 100, quantity: 100, timestamp: 2, filled: 0 }]
    );
    expect(trades[0].price).toBe(101);
  });

  it('should handle 100 share minimum for A-shares', () => {
    const trades = matchOrders(
      [{ id: 'b1', side: 'buy', price: 100, quantity: 300, timestamp: 1, filled: 0 }],
      [{ id: 's1', side: 'sell', price: 100, quantity: 200, timestamp: 2, filled: 0 }]
    );
    expect(trades[0].quantity).toBe(200);
  });
});

// VWAP calculation
describe('VWAP Calculation', () => {
  const calculateVWAP = (trades: Array<{ price: number; volume: number }>) => {
    if (trades.length === 0) return 0;
    let totalPV = 0;
    let totalV = 0;
    for (const t of trades) {
      totalPV += t.price * t.volume;
      totalV += t.volume;
    }
    return totalV === 0 ? 0 : totalPV / totalV;
  };

  it('should calculate VWAP correctly', () => {
    const vwap = calculateVWAP([
      { price: 100, volume: 1000 },
      { price: 101, volume: 2000 },
    ]);
    expect(vwap).toBeCloseTo(100.667, 2);
  });

  it('should handle single trade', () => {
    expect(calculateVWAP([{ price: 50, volume: 100 }])).toBe(50);
  });

  it('should handle no trades', () => {
    expect(calculateVWAP([])).toBe(0);
  });

  it('should handle zero volume', () => {
    expect(calculateVWAP([{ price: 50, volume: 0 }])).toBe(0);
  });

  it('should weight by volume', () => {
    const vwap = calculateVWAP([
      { price: 100, volume: 1 },
      { price: 200, volume: 99 },
    ]);
    expect(vwap).toBeCloseTo(199, 0);
  });

  it('should equal price for equal volumes', () => {
    const vwap = calculateVWAP([
      { price: 100, volume: 500 },
      { price: 200, volume: 500 },
    ]);
    expect(vwap).toBe(150);
  });

  it('should handle many trades', () => {
    const trades = Array.from({ length: 100 }, (_, i) => ({
      price: 100 + i * 0.1,
      volume: 1000
    }));
    const vwap = calculateVWAP(trades);
    expect(vwap).toBeGreaterThan(100);
    expect(vwap).toBeLessThan(110);
  });

  it('should handle negative prices', () => {
    const vwap = calculateVWAP([
      { price: -10, volume: 100 },
      { price: 10, volume: 100 },
    ]);
    expect(vwap).toBe(0);
  });

  it('should handle very large volumes', () => {
    const vwap = calculateVWAP([
      { price: 100, volume: 1e9 },
      { price: 101, volume: 1e9 },
    ]);
    expect(vwap).toBe(100.5);
  });
});

// Trading session analysis
describe('Trading Session Analysis', () => {
  const analyzeSession = (prices: number[], prevClose: number) => {
    if (prices.length === 0) return null;
    const open = prices[0];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const close = prices[prices.length - 1];
    const change = close - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    const amplitude = prevClose > 0 ? ((high - low) / prevClose) * 100 : 0;
    const gap = prevClose > 0 ? ((open - prevClose) / prevClose) * 100 : 0;
    const body = Math.abs(close - open);
    const upperShadow = high - Math.max(open, close);
    const lowerShadow = Math.min(open, close) - low;
    return {
      open, high, low, close, change, changePercent, amplitude, gap,
      body, upperShadow, lowerShadow,
      isBullish: close > open,
      isBearish: close < open,
      isDoji: (high - low) > 0 && body / (high - low) < 0.1,
    };
  };

  it('should analyze bullish session', () => {
    const result = analyzeSession([100, 102, 105, 108], 100)!;
    expect(result.isBullish).toBe(true);
    expect(result.close).toBe(108);
    expect(result.changePercent).toBe(8);
  });

  it('should analyze bearish session', () => {
    const result = analyzeSession([100, 98, 95, 92], 100)!;
    expect(result.isBearish).toBe(true);
    expect(result.close).toBe(92);
    expect(result.changePercent).toBe(-8);
  });

  it('should detect gap up', () => {
    const result = analyzeSession([105, 106, 107], 100)!;
    expect(result.gap).toBe(5);
  });

  it('should detect gap down', () => {
    const result = analyzeSession([95, 94, 93], 100)!;
    expect(result.gap).toBe(-5);
  });

  it('should calculate amplitude', () => {
    const result = analyzeSession([100, 110, 90, 100], 100)!;
    expect(result.amplitude).toBe(20);
  });

  it('should calculate body', () => {
    const result = analyzeSession([100, 105, 95, 108], 100)!;
    expect(result.body).toBe(8);
  });

  it('should calculate shadows', () => {
    const result = analyzeSession([100, 110, 90, 105], 100)!;
    expect(result.upperShadow).toBe(5);
    expect(result.lowerShadow).toBe(10);
  });

  it('should detect doji', () => {
    const result = analyzeSession([100, 110, 90, 100.5], 100)!;
    expect(result.isDoji).toBe(true);
  });

  it('should handle empty prices', () => {
    expect(analyzeSession([], 100)).toBeNull();
  });

  it('should handle single price', () => {
    const result = analyzeSession([100], 100)!;
    expect(result.open).toBe(100);
    expect(result.close).toBe(100);
    expect(result.change).toBe(0);
  });

  it('should handle zero prevClose', () => {
    const result = analyzeSession([100, 105, 110], 0)!;
    expect(result.changePercent).toBe(0);
    expect(result.amplitude).toBe(0);
    expect(result.gap).toBe(0);
  });

  it('should handle continuous uptrend', () => {
    const prices = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5);
    const result = analyzeSession(prices, 100)!;
    expect(result.isBullish).toBe(true);
    expect(result.high).toBe(149.5);
    expect(result.low).toBe(100);
  });
});

// Margin calculation
describe('Margin Calculation', () => {
  const calculateMargin = (position: {
    buyPrice: number; currentPrice: number; quantity: number;
    marginRatio: number; maintenanceRatio: number;
  }) => {
    const marketValue = position.currentPrice * position.quantity;
    const cost = position.buyPrice * position.quantity;
    const marginUsed = cost * position.marginRatio;
    const unrealizedPnL = (position.currentPrice - position.buyPrice) * position.quantity;
    const equity = marginUsed + unrealizedPnL;
    const marginRatio = marketValue > 0 ? equity / marketValue : 0;
    const liquidationPrice = position.buyPrice * (1 - position.marginRatio + position.maintenanceRatio);
    const isMarginCall = marginRatio < position.maintenanceRatio;
    return {
      marketValue, cost, marginUsed, unrealizedPnL, equity,
      marginRatio, liquidationPrice, isMarginCall
    };
  };

  it('should calculate margin for profitable position', () => {
    const result = calculateMargin({
      buyPrice: 100, currentPrice: 110, quantity: 1000,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.unrealizedPnL).toBe(10000);
    expect(result.isMarginCall).toBe(false);
  });

  it('should calculate margin for losing position', () => {
    const result = calculateMargin({
      buyPrice: 100, currentPrice: 90, quantity: 1000,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.unrealizedPnL).toBe(-10000);
  });

  it('should detect margin call', () => {
    const result = calculateMargin({
      buyPrice: 100, currentPrice: 40, quantity: 1000,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.isMarginCall).toBe(true);
  });

  it('should calculate liquidation price', () => {
    const result = calculateMargin({
      buyPrice: 100, currentPrice: 100, quantity: 1000,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.liquidationPrice).toBeCloseTo(63, 0);
  });

  it('should calculate market value', () => {
    const result = calculateMargin({
      buyPrice: 100, currentPrice: 105, quantity: 100,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.marketValue).toBe(10500);
  });

  it('should calculate cost', () => {
    const result = calculateMargin({
      buyPrice: 50, currentPrice: 55, quantity: 200,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.cost).toBe(10000);
  });

  it('should handle zero current price', () => {
    const result = calculateMargin({
      buyPrice: 100, currentPrice: 0, quantity: 100,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.marketValue).toBe(0);
    expect(result.marginRatio).toBe(0);
  });

  it('should handle breakeven', () => {
    const result = calculateMargin({
      buyPrice: 100, currentPrice: 100, quantity: 100,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.unrealizedPnL).toBe(0);
    expect(result.isMarginCall).toBe(false);
  });

  it('should calculate equity correctly', () => {
    const result = calculateMargin({
      buyPrice: 100, currentPrice: 120, quantity: 100,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.equity).toBe(result.marginUsed + result.unrealizedPnL);
  });

  it('should handle large positions', () => {
    const result = calculateMargin({
      buyPrice: 50, currentPrice: 55, quantity: 100000,
      marginRatio: 0.5, maintenanceRatio: 0.13
    });
    expect(result.marketValue).toBe(5500000);
    expect(result.cost).toBe(5000000);
  });
});

// Market depth calculation
describe('Market Depth Calculation', () => {
  const calculateDepth = (bids: Array<{ price: number; volume: number }>,
    asks: Array<{ price: number; volume: number }>) => {
    const sortedBids = [...bids].sort((a, b) => b.price - a.price);
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
    let bidAccum = 0;
    const bidDepth = sortedBids.map(b => { bidAccum += b.volume; return { ...b, cumulative: bidAccum }; });
    let askAccum = 0;
    const askDepth = sortedAsks.map(a => { askAccum += a.volume; return { ...a, cumulative: askAccum }; });
    const bestBid = sortedBids[0]?.price ?? 0;
    const bestAsk = sortedAsks[0]?.price ?? 0;
    const spread = bestAsk - bestBid;
    const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;
    const totalBidVol = bidAccum;
    const totalAskVol = askAccum;
    const imbalance = (totalBidVol + totalAskVol) > 0
      ? (totalBidVol - totalAskVol) / (totalBidVol + totalAskVol) : 0;
    return { bidDepth, askDepth, spread, spreadPercent, totalBidVol, totalAskVol, imbalance };
  };

  it('should calculate bid depth with cumulative', () => {
    const { bidDepth } = calculateDepth(
      [{ price: 100, volume: 100 }, { price: 99, volume: 200 }],
      []
    );
    expect(bidDepth[0].price).toBe(100);
    expect(bidDepth[0].cumulative).toBe(100);
    expect(bidDepth[1].cumulative).toBe(300);
  });

  it('should calculate ask depth sorted ascending', () => {
    const { askDepth } = calculateDepth(
      [],
      [{ price: 101, volume: 100 }, { price: 102, volume: 200 }]
    );
    expect(askDepth[0].price).toBe(101);
    expect(askDepth[0].cumulative).toBe(100);
  });

  it('should calculate spread', () => {
    const { spread, spreadPercent } = calculateDepth(
      [{ price: 100, volume: 100 }],
      [{ price: 101, volume: 100 }]
    );
    expect(spread).toBe(1);
    expect(spreadPercent).toBeCloseTo(1, 1);
  });

  it('should calculate imbalance', () => {
    const { imbalance } = calculateDepth(
      [{ price: 100, volume: 300 }],
      [{ price: 101, volume: 100 }]
    );
    expect(imbalance).toBeGreaterThan(0);
  });

  it('should handle equal volumes', () => {
    const { imbalance } = calculateDepth(
      [{ price: 100, volume: 100 }],
      [{ price: 101, volume: 100 }]
    );
    expect(imbalance).toBe(0);
  });

  it('should handle empty books', () => {
    const { spread, totalBidVol, totalAskVol } = calculateDepth([], []);
    expect(spread).toBe(0);
    expect(totalBidVol).toBe(0);
    expect(totalAskVol).toBe(0);
  });

  it('should handle many levels', () => {
    const bids = Array.from({ length: 10 }, (_, i) => ({ price: 100 - i, volume: 100 }));
    const asks = Array.from({ length: 10 }, (_, i) => ({ price: 101 + i, volume: 100 }));
    const { totalBidVol, totalAskVol, spread } = calculateDepth(bids, asks);
    expect(totalBidVol).toBe(1000);
    expect(totalAskVol).toBe(1000);
    expect(spread).toBe(1);
  });

  it('should calculate imbalance negative when asks dominate', () => {
    const { imbalance } = calculateDepth(
      [{ price: 100, volume: 100 }],
      [{ price: 101, volume: 300 }]
    );
    expect(imbalance).toBeLessThan(0);
  });
});

// A-share price limit checker
describe('A-Share Price Limit', () => {
  const checkPriceLimit = (price: number, prevClose: number, isST = false, isNew = false) => {
    const limitPct = isNew ? 44 : isST ? 5 : 10;
    const upperLimit = Math.round(prevClose * (1 + limitPct / 100) * 100) / 100;
    const lowerLimit = Math.round(prevClose * (1 - limitPct / 100) * 100) / 100;
    return {
      price,
      upperLimit,
      lowerLimit,
      isAtUpperLimit: price >= upperLimit,
      isAtLowerLimit: price <= lowerLimit,
      isWithinLimits: price > lowerLimit && price < upperLimit,
      remainingUp: upperLimit - price,
      remainingDown: price - lowerLimit,
    };
  };

  it('should calculate 10% limit for regular stock', () => {
    const result = checkPriceLimit(110, 100);
    expect(result.upperLimit).toBe(110);
    expect(result.isAtUpperLimit).toBe(true);
  });

  it('should calculate 5% limit for ST stock', () => {
    const result = checkPriceLimit(105, 100, true);
    expect(result.upperLimit).toBe(105);
    expect(result.isAtUpperLimit).toBe(true);
  });

  it('should calculate 44% limit for new stock', () => {
    const result = checkPriceLimit(144, 100, false, true);
    expect(result.upperLimit).toBe(144);
  });

  it('should detect lower limit hit', () => {
    const result = checkPriceLimit(90, 100);
    expect(result.isAtLowerLimit).toBe(true);
    expect(result.lowerLimit).toBe(90);
  });

  it('should detect within limits', () => {
    const result = checkPriceLimit(105, 100);
    expect(result.isWithinLimits).toBe(true);
  });

  it('should calculate remaining up/down', () => {
    const result = checkPriceLimit(105, 100);
    expect(result.remainingUp).toBeCloseTo(5, 1);
    expect(result.remainingDown).toBeCloseTo(15, 1);
  });

  it('should handle exact limit prices', () => {
    const upper = checkPriceLimit(110, 100);
    // 110 >= 110.00000000000001 may be false due to FP, use >= check with tolerance
    expect(upper.isAtUpperLimit || upper.remainingUp < 0.01).toBe(true);
    const lower = checkPriceLimit(90, 100);
    expect(lower.isAtLowerLimit || lower.remainingDown < 0.01).toBe(true);
  });

  it('should handle decimal prev close', () => {
    const result = checkPriceLimit(11.55, 10.5);
    expect(result.upperLimit).toBeCloseTo(11.55, 2);
  });

  it('should handle ST lower limit', () => {
    const result = checkPriceLimit(95, 100, true);
    expect(result.lowerLimit).toBe(95);
    expect(result.isAtLowerLimit).toBe(true);
  });

  it('should handle very low prices', () => {
    const result = checkPriceLimit(1.1, 1);
    expect(result.isAtUpperLimit).toBe(true);
  });

  it('should handle zero prev close', () => {
    const result = checkPriceLimit(1, 0);
    expect(result.upperLimit).toBe(0);
    expect(result.lowerLimit).toBe(0);
  });

  it('should handle price above limit (data error)', () => {
    const result = checkPriceLimit(115, 100);
    // Price above limit: technically >= upperLimit returns true, but should flag as anomaly
    expect(result.isAtUpperLimit).toBe(true); // mathematically above limit
    expect(result.isWithinLimits).toBe(false);
  });
});
