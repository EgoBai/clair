import { describe, it, expect } from 'vitest';

// ==================== 实时数据处理测试 ====================

interface QuoteUpdate { symbol: string; price: number; volume: number; timestamp: number; bid: number; ask: number; }

interface OrderBookLevel { price: number; volume: number; orders: number; }

function mergeQuoteUpdates(existing: QuoteUpdate, update: Partial<QuoteUpdate>): QuoteUpdate {
  return {
    symbol: update.symbol ?? existing.symbol,
    price: update.price ?? existing.price,
    volume: update.volume ?? existing.volume,
    timestamp: update.timestamp ?? existing.timestamp,
    bid: update.bid ?? existing.bid,
    ask: update.ask ?? existing.ask,
  };
}

function calcSpread(bid: number, ask: number): { absolute: number; relative: number; midPrice: number } {
  const absolute = ask - bid;
  const midPrice = (ask + bid) / 2;
  return { absolute, relative: midPrice === 0 ? 0 : absolute / midPrice, midPrice };
}

function calcVWAP(trades: { price: number; volume: number }[]): number {
  const totalVol = trades.reduce((s, t) => s + t.volume, 0);
  if (totalVol === 0) return 0;
  return trades.reduce((s, t) => s + t.price * t.volume, 0) / totalVol;
}

function calcTWAP(prices: { price: number; time: number }[]): number {
  if (prices.length === 0) return 0;
  if (prices.length === 1) return prices[0].price;
  let weightedSum = 0, totalTime = 0;
  for (let i = 1; i < prices.length; i++) {
    const duration = prices[i].time - prices[i - 1].time;
    weightedSum += prices[i - 1].price * duration;
    totalTime += duration;
  }
  return totalTime === 0 ? prices[0].price : weightedSum / totalTime;
}

function aggregateOrderBook(levels: OrderBookLevel[]): { totalVolume: number; totalOrders: number; vwap: number } {
  const totalVolume = levels.reduce((s, l) => s + l.volume, 0);
  const totalOrders = levels.reduce((s, l) => s + l.orders, 0);
  const vwap = totalVolume === 0 ? 0 : levels.reduce((s, l) => s + l.price * l.volume, 0) / totalVolume;
  return { totalVolume, totalOrders, vwap };
}

function calcMarketImpact(orderSize: number, avgDailyVolume: number, volatility: number): { temporaryImpact: number; permanentImpact: number } {
  if (avgDailyVolume === 0) return { temporaryImpact: 0, permanentImpact: 0 };
  const participationRate = orderSize / avgDailyVolume;
  return {
    temporaryImpact: volatility * Math.sqrt(participationRate) * 0.5,
    permanentImpact: volatility * participationRate * 0.1,
  };
}

function calcSlippage(expectedPrice: number, executedPrice: number, side: 'buy' | 'sell'): number {
  return side === 'buy' ? executedPrice - expectedPrice : expectedPrice - executedPrice;
}

function calcFillRate(filled: number, total: number): { rate: number; status: 'full' | 'partial' | 'none' } {
  if (total === 0) return { rate: 0, status: 'none' };
  const rate = filled / total;
  return { rate, status: rate >= 1 ? 'full' : rate > 0 ? 'partial' : 'none' };
}

function calcOrderLatency(sentTime: number, ackTime: number, fillTime: number): { ackLatency: number; fillLatency: number; totalLatency: number } {
  return { ackLatency: ackTime - sentTime, fillLatency: fillTime - ackTime, totalLatency: fillTime - sentTime };
}

describe('实时数据处理', () => {
  describe('行情更新合并', () => {
    it('应该合并更新', () => {
      const existing: QuoteUpdate = { symbol: '600519', price: 100, volume: 5000, timestamp: 1000, bid: 99, ask: 101 };
      const merged = mergeQuoteUpdates(existing, { price: 101, timestamp: 1001 });
      expect(merged.price).toBe(101);
      expect(merged.symbol).toBe('600519');
      expect(merged.volume).toBe(5000);
    });

    it('空更新应该返回原数据', () => {
      const existing: QuoteUpdate = { symbol: '600519', price: 100, volume: 5000, timestamp: 1000, bid: 99, ask: 101 };
      expect(mergeQuoteUpdates(existing, {})).toEqual(existing);
    });

    it('应该覆盖所有字段', () => {
      const existing: QuoteUpdate = { symbol: 'A', price: 100, volume: 5000, timestamp: 1000, bid: 99, ask: 101 };
      const update: QuoteUpdate = { symbol: 'B', price: 200, volume: 3000, timestamp: 2000, bid: 199, ask: 201 };
      const merged = mergeQuoteUpdates(existing, update);
      expect(merged).toEqual(update);
    });
  });

  describe('价差计算', () => {
    it('应该正确计算绝对价差', () => {
      expect(calcSpread(99, 101).absolute).toBe(2);
    });

    it('应该正确计算相对价差', () => {
      expect(calcSpread(99, 101).relative).toBeCloseTo(0.02, 3);
    });

    it('中间价应该正确', () => {
      expect(calcSpread(99, 101).midPrice).toBe(100);
    });

    it('零价差中间价应该正确', () => {
      expect(calcSpread(100, 100).absolute).toBe(0);
    });
  });

  describe('VWAP', () => {
    it('应该正确计算', () => {
      const trades = [{ price: 100, volume: 100 }, { price: 102, volume: 200 }];
      expect(calcVWAP(trades)).toBeCloseTo(101.33, 1);
    });

    it('等量VWAP应该等于平均价', () => {
      const trades = [{ price: 100, volume: 100 }, { price: 110, volume: 100 }];
      expect(calcVWAP(trades)).toBeCloseTo(105, 5);
    });

    it('空数据应该返回0', () => {
      expect(calcVWAP([])).toBe(0);
    });

    it('零成交量应该返回0', () => {
      expect(calcVWAP([{ price: 100, volume: 0 }])).toBe(0);
    });
  });

  describe('TWAP', () => {
    it('应该正确计算', () => {
      const prices = [{ price: 100, time: 0 }, { price: 110, time: 60 }, { price: 120, time: 120 }];
      const twap = calcTWAP(prices);
      expect(twap).toBeGreaterThan(100);
      expect(twap).toBeLessThan(120);
    });

    it('单点应该返回自身价格', () => {
      expect(calcTWAP([{ price: 100, time: 0 }])).toBe(100);
    });

    it('空数据应该返回0', () => {
      expect(calcTWAP([])).toBe(0);
    });
  });

  describe('盘口聚合', () => {
    it('应该正确汇总', () => {
      const levels: OrderBookLevel[] = [
        { price: 100, volume: 500, orders: 10 },
        { price: 99, volume: 300, orders: 5 },
      ];
      const agg = aggregateOrderBook(levels);
      expect(agg.totalVolume).toBe(800);
      expect(agg.totalOrders).toBe(15);
    });

    it('VWAP应该正确', () => {
      const levels: OrderBookLevel[] = [{ price: 100, volume: 100, orders: 1 }, { price: 102, volume: 100, orders: 1 }];
      expect(aggregateOrderBook(levels).vwap).toBeCloseTo(101, 5);
    });

    it('空盘口应该返回0', () => {
      expect(aggregateOrderBook([]).totalVolume).toBe(0);
    });
  });

  describe('市场冲击', () => {
    it('应该返回正数', () => {
      const impact = calcMarketImpact(10000, 1000000, 0.02);
      expect(impact.temporaryImpact).toBeGreaterThan(0);
      expect(impact.permanentImpact).toBeGreaterThan(0);
    });

    it('零成交量不应该崩溃', () => {
      const impact = calcMarketImpact(100, 0, 0.02);
      expect(impact.temporaryImpact).toBe(0);
    });

    it('大单冲击应该大于小单', () => {
      const small = calcMarketImpact(1000, 1000000, 0.02);
      const large = calcMarketImpact(100000, 1000000, 0.02);
      expect(large.temporaryImpact).toBeGreaterThan(small.temporaryImpact);
    });
  });

  describe('滑点计算', () => {
    it('买入滑点应该为正（成交高于预期）', () => {
      expect(calcSlippage(100, 101, 'buy')).toBe(1);
    });

    it('卖出滑点应该为正（成交低于预期）', () => {
      expect(calcSlippage(100, 99, 'sell')).toBe(1);
    });

    it('无滑点应该为0', () => {
      expect(calcSlippage(100, 100, 'buy')).toBe(0);
    });
  });

  describe('成交率', () => {
    it('全部成交应该返回full', () => {
      const result = calcFillRate(100, 100);
      expect(result.status).toBe('full');
      expect(result.rate).toBe(1);
    });

    it('部分成交应该返回partial', () => {
      const result = calcFillRate(50, 100);
      expect(result.status).toBe('partial');
      expect(result.rate).toBe(0.5);
    });

    it('零总量应该返回none', () => {
      expect(calcFillRate(0, 0).status).toBe('none');
    });
  });

  describe('订单延迟', () => {
    it('应该正确计算延迟', () => {
      const latency = calcOrderLatency(1000, 1050, 1100);
      expect(latency.ackLatency).toBe(50);
      expect(latency.fillLatency).toBe(50);
      expect(latency.totalLatency).toBe(100);
    });

    it('延迟应该非负', () => {
      const latency = calcOrderLatency(1000, 1010, 1020);
      expect(latency.ackLatency).toBeGreaterThanOrEqual(0);
      expect(latency.fillLatency).toBeGreaterThanOrEqual(0);
      expect(latency.totalLatency).toBeGreaterThanOrEqual(0);
    });
  });
});
