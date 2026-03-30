import { describe, it, expect } from 'vitest';

// 订单簿模拟
interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

function calculateSpread(orderBook: OrderBook): number {
  if (orderBook.bids.length === 0 || orderBook.asks.length === 0) return 0;
  return orderBook.asks[0].price - orderBook.bids[0].price;
}

function calculateSpreadPercent(orderBook: OrderBook): number {
  if (orderBook.bids.length === 0 || orderBook.asks.length === 0) return 0;
  const midPrice = (orderBook.asks[0].price + orderBook.bids[0].price) / 2;
  return (calculateSpread(orderBook) / midPrice) * 100;
}

function calculateImbalance(orderBook: OrderBook): number {
  const totalBidQty = orderBook.bids.reduce((sum, l) => sum + l.quantity, 0);
  const totalAskQty = orderBook.asks.reduce((sum, l) => sum + l.quantity, 0);
  const total = totalBidQty + totalAskQty;
  if (total === 0) return 0;
  return (totalBidQty - totalAskQty) / total;
}

function calculateVWAP(levels: OrderBookLevel[]): number {
  const totalValue = levels.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const totalQty = levels.reduce((sum, l) => sum + l.quantity, 0);
  if (totalQty === 0) return 0;
  return totalValue / totalQty;
}

function calculateDepthAtLevel(orderBook: OrderBook, priceRange: number): {
  bidDepth: number;
  askDepth: number;
} {
  if (orderBook.bids.length === 0 || orderBook.asks.length === 0) {
    return { bidDepth: 0, askDepth: 0 };
  }
  const midPrice = (orderBook.asks[0].price + orderBook.bids[0].price) / 2;
  return {
    bidDepth: orderBook.bids
      .filter(l => l.price >= midPrice - priceRange)
      .reduce((sum, l) => sum + l.quantity, 0),
    askDepth: orderBook.asks
      .filter(l => l.price <= midPrice + priceRange)
      .reduce((sum, l) => sum + l.quantity, 0)
  };
}

describe('订单簿分析', () => {
  const orderBook: OrderBook = {
    bids: [
      { price: 10.00, quantity: 5000, orders: 3 },
      { price: 9.99, quantity: 8000, orders: 5 },
      { price: 9.98, quantity: 3000, orders: 2 }
    ],
    asks: [
      { price: 10.01, quantity: 4000, orders: 2 },
      { price: 10.02, quantity: 6000, orders: 4 },
      { price: 10.03, quantity: 2000, orders: 1 }
    ],
    timestamp: Date.now()
  };

  it('买卖价差', () => {
    expect(calculateSpread(orderBook)).toBeCloseTo(0.01, 2);
  });

  it('价差百分比', () => {
    const spreadPct = calculateSpreadPercent(orderBook);
    expect(spreadPct).toBeGreaterThan(0);
    expect(spreadPct).toBeLessThan(1);
  });

  it('买卖不平衡度', () => {
    const imbalance = calculateImbalance(orderBook);
    expect(imbalance).toBeGreaterThan(-1);
    expect(imbalance).toBeLessThan(1);
  });

  it('买方深度更大时不平衡为正', () => {
    const imbalance = calculateImbalance(orderBook);
    const totalBids = orderBook.bids.reduce((s, l) => s + l.quantity, 0);
    const totalAsks = orderBook.asks.reduce((s, l) => s + l.quantity, 0);
    if (totalBids > totalAsks) {
      expect(imbalance).toBeGreaterThan(0);
    }
  });

  it('买方VWAP', () => {
    const vwap = calculateVWAP(orderBook.bids);
    expect(vwap).toBeGreaterThan(9.98);
    expect(vwap).toBeLessThan(10.01);
  });

  it('卖方VWAP', () => {
    const vwap = calculateVWAP(orderBook.asks);
    expect(vwap).toBeGreaterThan(10);
    expect(vwap).toBeLessThan(10.04);
  });

  it('空订单簿价差为零', () => {
    const empty: OrderBook = { bids: [], asks: [], timestamp: 0 };
    expect(calculateSpread(empty)).toBe(0);
  });

  it('深度计算', () => {
    const depth = calculateDepthAtLevel(orderBook, 0.02);
    expect(depth.bidDepth).toBeGreaterThan(0);
    expect(depth.askDepth).toBeGreaterThan(0);
  });

  it('空订单簿深度为零', () => {
    const empty: OrderBook = { bids: [], asks: [], timestamp: 0 };
    const depth = calculateDepthAtLevel(empty, 0.01);
    expect(depth.bidDepth).toBe(0);
    expect(depth.askDepth).toBe(0);
  });

  it('VWAP空层级返回零', () => {
    expect(calculateVWAP([])).toBe(0);
  });

  it('不平衡度范围[-1, 1]', () => {
    const ob1: OrderBook = {
      bids: [{ price: 10, quantity: 100000, orders: 1 }],
      asks: [{ price: 10.01, quantity: 0, orders: 0 }],
      timestamp: 0
    };
    expect(calculateImbalance(ob1)).toBeCloseTo(1, 1);
    
    const ob2: OrderBook = {
      bids: [{ price: 10, quantity: 0, orders: 0 }],
      asks: [{ price: 10.01, quantity: 100000, orders: 1 }],
      timestamp: 0
    };
    expect(calculateImbalance(ob2)).toBeCloseTo(-1, 1);
  });
});

// 逐笔成交分析
interface TradeTick {
  price: number;
  quantity: number;
  timestamp: number;
  side: 'buy' | 'sell';
}

function classifyTradeSide(price: number, prevPrice: number): 'buy' | 'sell' | 'neutral' {
  if (price > prevPrice) return 'buy';
  if (price < prevPrice) return 'sell';
  return 'neutral';
}

function calculateTradeFlow(ticks: TradeTick[]): { buyVolume: number; sellVolume: number; netFlow: number } {
  const buyVolume = ticks.filter(t => t.side === 'buy').reduce((s, t) => s + t.quantity, 0);
  const sellVolume = ticks.filter(t => t.side === 'sell').reduce((s, t) => s + t.quantity, 0);
  return { buyVolume, sellVolume, netFlow: buyVolume - sellVolume };
}

function calculateTickDirection(ticks: TradeTick[]): number {
  if (ticks.length < 2) return 0;
  let up = 0, down = 0;
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i].price > ticks[i - 1].price) up++;
    else if (ticks[i].price < ticks[i - 1].price) down++;
  }
  return up - down;
}

describe('逐笔成交分析', () => {
  it('判断主动买', () => {
    expect(classifyTradeSide(10.05, 10.00)).toBe('buy');
  });

  it('判断主动卖', () => {
    expect(classifyTradeSide(9.95, 10.00)).toBe('sell');
  });

  it('平盘', () => {
    expect(classifyTradeSide(10.00, 10.00)).toBe('neutral');
  });

  it('买卖量统计', () => {
    const ticks: TradeTick[] = [
      { price: 10, quantity: 100, timestamp: 1, side: 'buy' },
      { price: 9.9, quantity: 200, timestamp: 2, side: 'sell' },
      { price: 10.1, quantity: 150, timestamp: 3, side: 'buy' }
    ];
    const flow = calculateTradeFlow(ticks);
    expect(flow.buyVolume).toBe(250);
    expect(flow.sellVolume).toBe(200);
    expect(flow.netFlow).toBe(50);
  });

  it('净流入为负（卖盘主导）', () => {
    const ticks: TradeTick[] = [
      { price: 10, quantity: 100, timestamp: 1, side: 'buy' },
      { price: 9.9, quantity: 500, timestamp: 2, side: 'sell' }
    ];
    expect(calculateTradeFlow(ticks).netFlow).toBeLessThan(0);
  });

  it('涨跌笔数', () => {
    const ticks: TradeTick[] = [
      { price: 10, quantity: 100, timestamp: 1, side: 'buy' },
      { price: 10.1, quantity: 100, timestamp: 2, side: 'buy' },
      { price: 10.05, quantity: 100, timestamp: 3, side: 'sell' }
    ];
    expect(calculateTickDirection(ticks)).toBe(0); // 1 up, 1 down
  });

  it('空逐笔返回零', () => {
    expect(calculateTickDirection([])).toBe(0);
  });

  it('单笔逐笔返回零', () => {
    expect(calculateTickDirection([{ price: 10, quantity: 100, timestamp: 1, side: 'buy' }])).toBe(0);
  });
});

// 指数权重计算
function calculateIndexWeights(marketCaps: number[]): number[] {
  const total = marketCaps.reduce((a, b) => a + b, 0);
  if (total === 0) return marketCaps.map(() => 0);
  return marketCaps.map(cap => cap / total);
}

function calculateWeightedReturn(returns: number[], weights: number[]): number {
  if (returns.length !== weights.length) return 0;
  return returns.reduce((sum, r, i) => sum + r * weights[i], 0);
}

function calculateEqualWeightReturn(returns: number[]): number {
  if (returns.length === 0) return 0;
  return returns.reduce((a, b) => a + b, 0) / returns.length;
}

describe('指数权重计算', () => {
  it('权重总和为1', () => {
    const caps = [1000, 2000, 3000];
    const weights = calculateIndexWeights(caps);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('大市值权重高', () => {
    const caps = [100, 900];
    const weights = calculateIndexWeights(caps);
    expect(weights[1]).toBeGreaterThan(weights[0]);
  });

  it('零市值权重为零', () => {
    const caps = [0, 0, 0];
    const weights = calculateIndexWeights(caps);
    expect(weights.every(w => w === 0)).toBe(true);
  });

  it('加权收益率', () => {
    const returns = [0.1, -0.05, 0.02];
    const weights = [0.5, 0.3, 0.2];
    const wr = calculateWeightedReturn(returns, weights);
    // 0.1*0.5 + (-0.05)*0.3 + 0.02*0.2 = 0.05 - 0.015 + 0.004 = 0.039
    expect(wr).toBeCloseTo(0.039, 4);
  });

  it('等权收益率', () => {
    const returns = [0.1, -0.1, 0.2];
    expect(calculateEqualWeightReturn(returns)).toBeCloseTo(0.0667, 3);
  });

  it('空数组等权收益', () => {
    expect(calculateEqualWeightReturn([])).toBe(0);
  });

  it('长度不匹配返回零', () => {
    expect(calculateWeightedReturn([1, 2], [0.5])).toBe(0);
  });

  it('单成分等权收益', () => {
    expect(calculateEqualWeightReturn([0.15])).toBe(0.15);
  });
});

// 异常值检测
function detectOutliers(values: number[], threshold = 2): { normal: number[]; outliers: number[] } {
  if (values.length < 2) return { normal: [...values], outliers: [] };
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
  
  const normal: number[] = [];
  const outliers: number[] = [];
  
  for (const v of values) {
    if (std === 0 || Math.abs(v - mean) / std <= threshold) {
      normal.push(v);
    } else {
      outliers.push(v);
    }
  }
  
  return { normal, outliers };
}

function calculateZScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

describe('异常值检测', () => {
  it('无异常值', () => {
    const values = [10, 10.5, 9.8, 10.2, 9.9];
    const result = detectOutliers(values);
    expect(result.outliers).toHaveLength(0);
    expect(result.normal).toHaveLength(5);
  });

  it('检测异常值', () => {
    const values = [10, 10, 10, 10, 200]; // 200是异常值
    const result = detectOutliers(values, 1.5); // lower threshold to detect 200
    expect(result.outliers).toContain(200);
  });

  it('空数组', () => {
    const result = detectOutliers([]);
    expect(result.normal).toHaveLength(0);
    expect(result.outliers).toHaveLength(0);
  });

  it('单值', () => {
    const result = detectOutliers([42]);
    expect(result.normal).toContain(42);
    expect(result.outliers).toHaveLength(0);
  });

  it('相同值无异常', () => {
    const result = detectOutliers([5, 5, 5, 5]);
    expect(result.outliers).toHaveLength(0);
  });

  it('Z分数计算', () => {
    expect(calculateZScore(15, 10, 5)).toBe(1);
    expect(calculateZScore(0, 10, 5)).toBe(-2);
  });

  it('零标准差Z分数为零', () => {
    expect(calculateZScore(10, 10, 0)).toBe(0);
  });

  it('阈值影响检测结果', () => {
    const values = [1, 1, 1, 1, 5];
    const r1 = detectOutliers(values, 1);
    const r2 = detectOutliers(values, 10);
    expect(r1.outliers.length).toBeGreaterThanOrEqual(r2.outliers.length);
  });
});

// 数据插值
function linearInterpolate(x: number, x1: number, y1: number, x2: number, y2: number): number {
  if (x2 === x1) return y1;
  return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
}

function fillMissingDates(dates: string[], values: (number | null)[]): (number | null)[] {
  const result: (number | null)[] = [...values];
  let lastValidIndex = -1;
  
  for (let i = 0; i < result.length; i++) {
    if (result[i] !== null) {
      // 回填之前的空值
      if (lastValidIndex >= 0 && i - lastValidIndex > 1) {
        const startVal = result[lastValidIndex] as number;
        const endVal = result[i] as number;
        for (let j = lastValidIndex + 1; j < i; j++) {
          const ratio = (j - lastValidIndex) / (i - lastValidIndex);
          result[j] = startVal + (endVal - startVal) * ratio;
        }
      }
      lastValidIndex = i;
    }
  }
  
  return result;
}

describe('数据插值', () => {
  it('线性插值中点', () => {
    expect(linearInterpolate(5, 0, 0, 10, 10)).toBe(5);
  });

  it('线性插值精确点', () => {
    expect(linearInterpolate(0, 0, 0, 10, 10)).toBe(0);
  });

  it('相同X返回y1', () => {
    expect(linearInterpolate(5, 5, 10, 5, 20)).toBe(10);
  });

  it('填充缺失值', () => {
    const values = [10, null, null, 16, 18];
    const result = fillMissingDates([], values);
    expect(result[0]).toBe(10);
    expect(result[1]).toBeCloseTo(12, 1);
    expect(result[2]).toBeCloseTo(14, 1);
    expect(result[3]).toBe(16);
  });

  it('无缺失值不变', () => {
    const values = [10, 12, 14, 16];
    const result = fillMissingDates([], values);
    expect(result).toEqual([10, 12, 14, 16]);
  });

  it('全部为空返回全部为空', () => {
    const values = [null, null, null];
    const result = fillMissingDates([], values);
    expect(result).toEqual([null, null, null]);
  });

  it('首尾为空不填充', () => {
    const values = [null, 10, null];
    const result = fillMissingDates([], values);
    expect(result[0]).toBeNull();
    expect(result[2]).toBeNull();
    expect(result[1]).toBe(10);
  });
});

// 价格格式化
function formatPrice(price: number, decimals: number = 2): string {
  if (price >= 1e6) return (price / 1e4).toFixed(decimals) + '万';
  return price.toFixed(decimals);
}

function formatCurrency(amount: number, currency: string = '¥'): string {
  return `${currency}${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function formatPercentage(value: number, decimals: number = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

describe('价格格式化', () => {
  it('常规价格', () => {
    expect(formatPrice(10.5)).toBe('10.50');
  });

  it('高价转万', () => {
    expect(formatPrice(1500000)).toBe('150.00万');
  });

  it('零价格', () => {
    expect(formatPrice(0)).toBe('0.00');
  });

  it('货币格式化', () => {
    expect(formatCurrency(1234567.89)).toBe('¥1,234,567.89');
  });

  it('小金额货币', () => {
    expect(formatCurrency(123.4)).toBe('¥123.40');
  });

  it('百分比正数', () => {
    expect(formatPercentage(5.67)).toBe('+5.67%');
  });

  it('百分比负数', () => {
    expect(formatPercentage(-3.21)).toBe('-3.21%');
  });

  it('百分比零', () => {
    expect(formatPercentage(0)).toBe('0.00%');
  });

  it('百分比自定义小数位', () => {
    expect(formatPercentage(5.678, 3)).toBe('+5.678%');
  });
});
