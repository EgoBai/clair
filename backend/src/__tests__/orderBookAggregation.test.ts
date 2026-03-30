import { describe, it, expect } from 'vitest';

describe('盘口聚合分析', () => {
  interface OrderLevel { price: number; volume: number; }
  interface OrderBook { bids: OrderLevel[]; asks: OrderLevel[]; }

  function calcSpread(ob: OrderBook) {
    if (!ob.asks.length || !ob.bids.length) return null;
    return ob.asks[0].price - ob.bids[0].price;
  }
  function calcMid(ob: OrderBook) {
    if (!ob.asks.length || !ob.bids.length) return null;
    return (ob.asks[0].price + ob.bids[0].price) / 2;
  }
  function calcTotalVolume(levels: OrderLevel[]) {
    return levels.reduce((s, l) => s + l.volume, 0);
  }
  function calcVWAP(levels: OrderLevel[]) {
    const tv = calcTotalVolume(levels);
    if (tv === 0) return 0;
    return levels.reduce((s, l) => s + l.price * l.volume, 0) / tv;
  }
  function calcImbalance(ob: OrderBook) {
    const bv = calcTotalVolume(ob.bids);
    const av = calcTotalVolume(ob.asks);
    if (bv + av === 0) return 0;
    return (bv - av) / (bv + av);
  }
  function findSupport(levels: OrderLevel[], threshold: number) {
    return levels.filter(l => l.volume >= threshold);
  }
  function depthAtPrice(levels: OrderLevel[], target: number) {
    return levels.filter(l => l.price <= target).reduce((s, l) => s + l.volume, 0);
  }

  const sampleOB: OrderBook = {
    bids: [
      { price: 10.00, volume: 500 },
      { price: 9.99, volume: 800 },
      { price: 9.98, volume: 1200 },
      { price: 9.97, volume: 300 },
      { price: 9.96, volume: 600 },
    ],
    asks: [
      { price: 10.01, volume: 400 },
      { price: 10.02, volume: 600 },
      { price: 10.03, volume: 900 },
      { price: 10.04, volume: 200 },
      { price: 10.05, volume: 700 },
    ],
  };

  it('计算价差', () => {
    expect(calcSpread(sampleOB)).toBeCloseTo(0.01, 5);
  });

  it('计算中间价', () => {
    expect(calcMid(sampleOB)).toBeCloseTo(10.005, 5);
  });

  it('计算买盘总量', () => {
    expect(calcTotalVolume(sampleOB.bids)).toBe(3400);
  });

  it('计算卖盘总量', () => {
    expect(calcTotalVolume(sampleOB.asks)).toBe(2800);
  });

  it('计算买盘VWAP', () => {
    const vwap = calcVWAP(sampleOB.bids);
    expect(vwap).toBeCloseTo(9.982, 2);
  });

  it('计算卖盘VWAP', () => {
    const vwap = calcVWAP(sampleOB.asks);
    expect(vwap).toBeGreaterThan(10.01);
  });

  it('计算盘口不平衡度', () => {
    const imb = calcImbalance(sampleOB);
    expect(imb).toBeGreaterThan(0); // 买盘 > 卖盘
    expect(imb).toBeLessThan(1);
  });

  it('不平衡度对称情况', () => {
    const ob: OrderBook = {
      bids: [{ price: 10, volume: 100 }],
      asks: [{ price: 11, volume: 100 }],
    };
    expect(calcImbalance(ob)).toBe(0);
  });

  it('空盘口返回0', () => {
    expect(calcImbalance({ bids: [], asks: [] })).toBe(0);
  });

  it('单边空盘口', () => {
    const ob: OrderBook = { bids: [{ price: 10, volume: 100 }], asks: [] };
    expect(calcImbalance(ob)).toBe(1);
  });

  it('查找支撑位', () => {
    const supports = findSupport(sampleOB.bids, 600);
    expect(supports.length).toBeGreaterThanOrEqual(1);
    expect(supports[0].volume).toBeGreaterThanOrEqual(600);
  });

  it('计算指定价位深度', () => {
    const depth = depthAtPrice(sampleOB.bids, 9.98);
    expect(depth).toBeGreaterThanOrEqual(1200); // bids <= 9.98: 9.98(1200)
  });

  it('价差为0的情况', () => {
    const ob: OrderBook = {
      bids: [{ price: 10, volume: 100 }],
      asks: [{ price: 10, volume: 100 }],
    };
    expect(calcSpread(ob)).toBe(0);
  });

  it('盘口层级数量', () => {
    expect(sampleOB.bids).toHaveLength(5);
    expect(sampleOB.asks).toHaveLength(5);
  });

  it('买盘价格递减', () => {
    for (let i = 1; i < sampleOB.bids.length; i++) {
      expect(sampleOB.bids[i].price).toBeLessThan(sampleOB.bids[i - 1].price);
    }
  });

  it('卖盘价格递增', () => {
    for (let i = 1; i < sampleOB.asks.length; i++) {
      expect(sampleOB.asks[i].price).toBeGreaterThan(sampleOB.asks[i - 1].price);
    }
  });

  it('大单检测', () => {
    const bigOrders = [...sampleOB.bids, ...sampleOB.asks].filter(l => l.volume >= 1000);
    expect(bigOrders).toHaveLength(1);
    expect(bigOrders[0].price).toBe(9.98);
  });

  it('加权均价合理性', () => {
    const bidsVwap = calcVWAP(sampleOB.bids);
    expect(bidsVwap).toBeLessThanOrEqual(sampleOB.bids[0].price);
    expect(bidsVwap).toBeGreaterThanOrEqual(sampleOB.bids[sampleOB.bids.length - 1].price);
  });
});
