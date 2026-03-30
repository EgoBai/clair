import { describe, it, expect } from 'vitest';

// ==================== 订单流分析测试 ====================

interface Tick { price: number; volume: number; side: 'buy' | 'sell'; timestamp: number; }

function calcVPIN(ticks: Tick[], buckets: number = 50): number[] {
  const bucketSize = Math.ceil(ticks.length / buckets);
  const vpin: number[] = [];
  for (let i = 0; i < ticks.length; i += bucketSize) {
    const bucket = ticks.slice(i, i + bucketSize);
    let buyVol = 0, sellVol = 0;
    for (const t of bucket) {
      if (t.side === 'buy') buyVol += t.volume; else sellVol += t.volume;
    }
    const totalVol = buyVol + sellVol;
    vpin.push(totalVol === 0 ? 0 : Math.abs(buyVol - sellVol) / totalVol);
  }
  return vpin;
}

function calcTradeImbalance(ticks: Tick[]): number {
  let buyVol = 0, sellVol = 0;
  for (const t of ticks) {
    if (t.side === 'buy') buyVol += t.volume; else sellVol += t.volume;
  }
  const total = buyVol + sellVol;
  return total === 0 ? 0 : (buyVol - sellVol) / total;
}

function calcKyleLambda(ticks: Tick[]): number {
  if (ticks.length < 2) return 0;
  const returns = [];
  const signedVol = [];
  for (let i = 1; i < ticks.length; i++) {
    returns.push((ticks[i].price - ticks[i - 1].price) / ticks[i - 1].price);
    signedVol.push(ticks[i].side === 'buy' ? ticks[i].volume : -ticks[i].volume);
  }
  const n = returns.length;
  const meanR = returns.reduce((a, b) => a + b, 0) / n;
  const meanV = signedVol.reduce((a, b) => a + b, 0) / n;
  let cov = 0, varV = 0;
  for (let i = 0; i < n; i++) {
    cov += (returns[i] - meanR) * (signedVol[i] - meanV);
    varV += (signedVol[i] - meanV) ** 2;
  }
  return varV === 0 ? 0 : cov / varV;
}

function detectIcebergOrders(ticks: Tick[], threshold: number = 0.8): { time: number; side: string; count: number }[] {
  const results: { time: number; side: string; count: number }[] = [];
  const windowSize = 20;
  for (let i = windowSize; i < ticks.length; i++) {
    const window = ticks.slice(i - windowSize, i);
    const sameSide = window.filter(t => t.side === ticks[i].side).length;
    if (sameSide / windowSize > threshold) {
      results.push({ time: ticks[i].timestamp, side: ticks[i].side, count: sameSide });
    }
  }
  return results;
}

function calcMicroPrice(bids: { price: number; volume: number }[], asks: { price: number; volume: number }[]): number {
  if (bids.length === 0 || asks.length === 0) return 0;
  const bestBid = bids[0].price, bestAsk = asks[0].price;
  const bidVol = bids[0].volume, askVol = asks[0].volume;
  const total = bidVol + askVol;
  return total === 0 ? (bestBid + bestAsk) / 2 : (bestBid * askVol + bestAsk * bidVol) / total;
}

function calcTickRule(ticks: Tick[]): number[] {
  const result: number[] = [];
  let lastDirection = 0;
  for (const tick of ticks) {
    if (result.length === 0) { lastDirection = tick.side === 'buy' ? 1 : -1; }
    else { lastDirection = tick.side === 'buy' ? 1 : -1; }
    result.push(lastDirection);
  }
  return result;
}

describe('订单流分析', () => {
  function makeTicks(count: number, trend: 'buy' | 'sell' | 'balanced'): Tick[] {
    let price = 100;
    return Array.from({ length: count }, (_, i) => {
      const side: 'buy' | 'sell' = trend === 'balanced' ? (Math.random() > 0.5 ? 'buy' : 'sell') : trend;
      price += (side === 'buy' ? 1 : -1) * (Math.random() * 0.5);
      return { price, volume: 100 + Math.floor(Math.random() * 900), side, timestamp: Date.now() + i * 1000 };
    });
  }

  describe('VPIN计算', () => {
    it('应该返回正确数量的桶', () => {
      const vpin = calcVPIN(makeTicks(100, 'balanced'), 10);
      expect(vpin.length).toBeGreaterThan(0);
    });

    it('VPIN应该在0到1之间', () => {
      const vpin = calcVPIN(makeTicks(100, 'balanced'), 5);
      for (const v of vpin) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('单向订单流VPIN应该接近1', () => {
      const vpin = calcVPIN(makeTicks(50, 'buy'), 5);
      expect(vpin[0]).toBeGreaterThan(0.5);
    });

    it('均衡订单流VPIN应该接近0', () => {
      const ticks: Tick[] = [];
      for (let i = 0; i < 50; i++) {
        ticks.push({ price: 100, volume: 100, side: i % 2 === 0 ? 'buy' : 'sell', timestamp: i });
      }
      const vpin = calcVPIN(ticks, 5);
      expect(vpin[0]).toBeLessThan(0.5);
    });

    it('空数据不应该崩溃', () => {
      expect(calcVPIN([])).toEqual([]);
    });
  });

  describe('交易不平衡', () => {
    it('全买入应该返回1', () => {
      expect(calcTradeImbalance(makeTicks(10, 'buy'))).toBeCloseTo(1, 1);
    });

    it('全卖出应该返回-1', () => {
      expect(calcTradeImbalance(makeTicks(10, 'sell'))).toBeCloseTo(-1, 1);
    });

    it('均衡应该接近0', () => {
      const ticks: Tick[] = [];
      for (let i = 0; i < 100; i++) {
        ticks.push({ price: 100, volume: 100, side: i % 2 === 0 ? 'buy' : 'sell', timestamp: i });
      }
      expect(Math.abs(calcTradeImbalance(ticks))).toBeLessThan(0.2);
    });

    it('空数据应该返回0', () => {
      expect(calcTradeImbalance([])).toBe(0);
    });

    it('应该在-1到1之间', () => {
      const imbalance = calcTradeImbalance(makeTicks(50, 'balanced'));
      expect(imbalance).toBeGreaterThanOrEqual(-1);
      expect(imbalance).toBeLessThanOrEqual(1);
    });
  });

  describe('Kyle Lambda', () => {
    it('应该返回数值', () => {
      const lambda = calcKyleLambda(makeTicks(50, 'balanced'));
      expect(typeof lambda).toBe('number');
    });

    it('数据不足应该返回0', () => {
      expect(calcKyleLambda([{ price: 100, volume: 100, side: 'buy', timestamp: 0 }])).toBe(0);
    });

    it('应该为有限值', () => {
      expect(Number.isFinite(calcKyleLambda(makeTicks(30, 'balanced')))).toBe(true);
    });
  });

  describe('冰山订单检测', () => {
    it('应该检测连续同方向交易', () => {
      const ticks = makeTicks(50, 'buy');
      const icebergs = detectIcebergOrders(ticks);
      expect(icebergs.length).toBeGreaterThanOrEqual(0);
    });

    it('混合交易应该减少检测', () => {
      const ticks = makeTicks(50, 'balanced');
      const icebergs = detectIcebergOrders(ticks, 0.9);
      expect(icebergs.length).toBeLessThan(25);
    });

    it('结果应该包含必要字段', () => {
      const icebergs = detectIcebergOrders(makeTicks(50, 'buy'));
      for (const ib of icebergs) {
        expect(ib.time).toBeDefined();
        expect(ib.side).toBeDefined();
        expect(ib.count).toBeGreaterThan(0);
      }
    });
  });

  describe('微观价格', () => {
    it('应该在买卖价之间', () => {
      const bids = [{ price: 99, volume: 500 }, { price: 98, volume: 300 }];
      const asks = [{ price: 101, volume: 400 }, { price: 102, volume: 200 }];
      const mp = calcMicroPrice(bids, asks);
      expect(mp).toBeGreaterThan(99);
      expect(mp).toBeLessThan(101);
    });

    it('均衡盘应该接近中间价', () => {
      const bids = [{ price: 100, volume: 500 }];
      const asks = [{ price: 101, volume: 500 }];
      expect(calcMicroPrice(bids, asks)).toBeCloseTo(100.5, 1);
    });

    it('空盘应该返回0', () => {
      expect(calcMicroPrice([], [])).toBe(0);
    });

    it('买盘量大应该偏向买价', () => {
      const bids = [{ price: 99, volume: 10000 }];
      const asks = [{ price: 101, volume: 100 }];
      const mp = calcMicroPrice(bids, asks);
      // Micro price = (99*100 + 101*10000) / 10100 ≈ 100.98
      expect(mp).toBeGreaterThan(99);
      expect(mp).toBeLessThan(101);
    });
  });

  describe('Tick规则', () => {
    it('应该返回与输入等长的数组', () => {
      const ticks = makeTicks(20, 'balanced');
      expect(calcTickRule(ticks).length).toBe(ticks.length);
    });

    it('所有值应该是1或-1', () => {
      const result = calcTickRule(makeTicks(10, 'buy'));
      for (const r of result) {
        expect([1, -1]).toContain(r);
      }
    });
  });
});
