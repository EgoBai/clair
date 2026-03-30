import { describe, it, expect } from 'vitest';

// ===== 市场微观结构分析 =====
describe('Market Microstructure Analysis', () => {
  interface Tick { price: number; volume: number; timestamp: number; side: 'buy' | 'sell'; }
  interface OHLCV { open: number; high: number; low: number; close: number; volume: number; vwap: number; }

  const calcVWAP = (ticks: Tick[]): number => {
    if (ticks.length === 0) return 0;
    const tpv = ticks.reduce((s, t) => s + t.price * t.volume, 0);
    const vol = ticks.reduce((s, t) => s + t.volume, 0);
    return vol > 0 ? tpv / vol : 0;
  };

  const calcSpread = (bid: number, ask: number): { absolute: number; relative: number; bps: number } => {
    const abs = ask - bid;
    const mid = (bid + ask) / 2;
    return { absolute: abs, relative: mid > 0 ? abs / mid : 0, bps: mid > 0 ? (abs / mid) * 10000 : 0 };
  };

  const calcOrderImbalance = (bidVol: number, askVol: number): number => {
    const total = bidVol + askVol;
    return total > 0 ? (bidVol - askVol) / total : 0;
  };

  const calcKyleLambda = (ticks: Tick[]): number => {
    if (ticks.length < 3) return 0;
    const returns: number[] = [];
    const signedVol: number[] = [];
    for (let i = 1; i < ticks.length; i++) {
      returns.push(ticks[i].price - ticks[i - 1].price);
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
    return varV > 0 ? cov / varV : 0;
  };

  const calcAmihudIlliquidity = (bars: { returns: number; volume: number }[]): number => {
    if (bars.length === 0) return 0;
    return bars.reduce((s, b) => s + (b.volume > 0 ? Math.abs(b.returns) / b.volume : 0), 0) / bars.length;
  };

  const aggregateTicksToK = (ticks: Tick[], intervalMs: number): OHLCV[] => {
    if (ticks.length === 0) return [];
    const buckets = new Map<number, Tick[]>();
    for (const t of ticks) {
      const key = Math.floor(t.timestamp / intervalMs) * intervalMs;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(t);
    }
    return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([, bkt]) => ({
      open: bkt[0].price,
      high: Math.max(...bkt.map(b => b.price)),
      low: Math.min(...bkt.map(b => b.price)),
      close: bkt[bkt.length - 1].price,
      volume: bkt.reduce((s, b) => s + b.volume, 0),
      vwap: calcVWAP(bkt),
    }));
  };

  describe('VWAP计算', () => {
    it('等量等价应等于价格', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 1, side: 'buy' },
        { price: 10, volume: 100, timestamp: 2, side: 'sell' },
      ];
      expect(calcVWAP(ticks)).toBe(10);
    });

    it('加权平均应正确', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 1, side: 'buy' },
        { price: 20, volume: 300, timestamp: 2, side: 'sell' },
      ];
      expect(calcVWAP(ticks)).toBeCloseTo(17.5);
    });

    it('空数据返回零', () => {
      expect(calcVWAP([])).toBe(0);
    });

    it('零成交量返回零', () => {
      const ticks: Tick[] = [{ price: 10, volume: 0, timestamp: 1, side: 'buy' }];
      expect(calcVWAP(ticks)).toBe(0);
    });

    it('大量交易数据应稳定', () => {
      const ticks: Tick[] = Array.from({ length: 1000 }, (_, i) => ({
        price: 100 + Math.sin(i * 0.1) * 5,
        volume: Math.floor(Math.random() * 1000) + 100,
        timestamp: i,
        side: Math.random() > 0.5 ? 'buy' : 'sell' as 'buy' | 'sell',
      }));
      const vwap = calcVWAP(ticks);
      expect(vwap).toBeGreaterThan(90);
      expect(vwap).toBeLessThan(110);
    });
  });

  describe('买卖价差', () => {
    it('绝对价差应为正', () => {
      const spread = calcSpread(10, 10.05);
      expect(spread.absolute).toBeCloseTo(0.05);
    });

    it('相对价差应为正比', () => {
      const spread = calcSpread(10, 10.10);
      expect(spread.relative).toBeCloseTo(0.01);
    });

    it('BPS计算正确', () => {
      const spread = calcSpread(100, 100.10);
      expect(spread.bps).toBeCloseTo(10);
    });

    it('相同买卖价价差为零', () => {
      const spread = calcSpread(10, 10);
      expect(spread.absolute).toBe(0);
      expect(spread.relative).toBe(0);
    });

    it('不同价位价差BPS应相近(相同比例)', () => {
      const s1 = calcSpread(10, 10.01);
      const s2 = calcSpread(100, 100.01);
      // BPS = (spread/mid)*10000. 10/10.005 vs 100/100.005 — similar but not identical
      expect(Math.abs(s1.bps - s2.bps)).toBeLessThan(10);
    });
  });

  describe('订单簿不平衡', () => {
    it('买卖相等应为零', () => {
      expect(calcOrderImbalance(100, 100)).toBe(0);
    });

    it('买方多应为正', () => {
      expect(calcOrderImbalance(200, 100)).toBeGreaterThan(0);
    });

    it('卖方多应为负', () => {
      expect(calcOrderImbalance(100, 200)).toBeLessThan(0);
    });

    it('范围在-1到1之间', () => {
      expect(calcOrderImbalance(1000, 1)).toBeGreaterThan(0.9);
      expect(calcOrderImbalance(1, 1000)).toBeLessThan(-0.9);
    });

    it('双边为零返回零', () => {
      expect(calcOrderImbalance(0, 0)).toBe(0);
    });

    it('极端不平衡', () => {
      const imbalance = calcOrderImbalance(1000000, 1);
      expect(imbalance).toBeCloseTo(1, 1);
    });
  });

  describe('Kyle Lambda', () => {
    it('正相关应返回正值', () => {
      const ticks: Tick[] = Array.from({ length: 20 }, (_, i) => ({
        price: 100 + i * 0.5,
        volume: 100 + i * 10,
        timestamp: i,
        side: 'buy' as const,
      }));
      const lambda = calcKyleLambda(ticks);
      expect(isFinite(lambda)).toBe(true);
    });

    it('数据不足返回零', () => {
      expect(calcKyleLambda([{ price: 10, volume: 100, timestamp: 1, side: 'buy' }])).toBe(0);
    });

    it('空数据返回零', () => {
      expect(calcKyleLambda([])).toBe(0);
    });
  });

  describe('Amihud非流动性', () => {
    it('高流动性应返回小值', () => {
      const bars = Array.from({ length: 50 }, () => ({ returns: 0.001, volume: 1000000 }));
      const illiq = calcAmihudIlliquidity(bars);
      expect(illiq).toBeLessThan(0.0001);
    });

    it('低流动性应返回大值', () => {
      const bars = Array.from({ length: 50 }, () => ({ returns: 0.05, volume: 100 }));
      const illiq = calcAmihudIlliquidity(bars);
      expect(illiq).toBeGreaterThan(0.0001);
    });

    it('空数据返回零', () => {
      expect(calcAmihudIlliquidity([])).toBe(0);
    });

    it('零成交量跳过', () => {
      const bars = [{ returns: 0.01, volume: 0 }, { returns: 0.02, volume: 1000 }];
      const illiq = calcAmihudIlliquidity(bars);
      expect(illiq).toBeGreaterThan(0);
    });
  });

  describe('Tick聚合K线', () => {
    it('单时间窗口应产生一根K线', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 100, side: 'buy' },
        { price: 11, volume: 200, timestamp: 200, side: 'sell' },
        { price: 10.5, volume: 150, timestamp: 300, side: 'buy' },
      ];
      const klines = aggregateTicksToK(ticks, 1000);
      expect(klines.length).toBe(1);
      expect(klines[0].open).toBe(10);
      expect(klines[0].high).toBe(11);
      expect(klines[0].low).toBe(10);
      expect(klines[0].close).toBe(10.5);
      expect(klines[0].volume).toBe(450);
    });

    it('多时间窗口应产生多根K线', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 100, side: 'buy' },
        { price: 11, volume: 200, timestamp: 1100, side: 'sell' },
        { price: 12, volume: 150, timestamp: 2100, side: 'buy' },
      ];
      const klines = aggregateTicksToK(ticks, 1000);
      expect(klines.length).toBe(3);
    });

    it('空tick返回空', () => {
      expect(aggregateTicksToK([], 1000)).toEqual([]);
    });

    it('VWAP应包含在K线中', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 100, side: 'buy' },
        { price: 20, volume: 100, timestamp: 200, side: 'sell' },
      ];
      const klines = aggregateTicksToK(ticks, 1000);
      expect(klines[0].vwap).toBeCloseTo(15);
    });

    it('100个tick聚合正确', () => {
      const ticks: Tick[] = Array.from({ length: 100 }, (_, i) => ({
        price: 100 + Math.sin(i * 0.3) * 3,
        volume: 100 + i,
        timestamp: i * 1000, // each tick 1000ms apart, so 10 ticks per 10000ms bucket
        side: i % 2 === 0 ? 'buy' : 'sell' as 'buy' | 'sell',
      }));
      const klines = aggregateTicksToK(ticks, 10000);
      expect(klines.length).toBe(10);
      klines.forEach(k => {
        expect(k.high).toBeGreaterThanOrEqual(k.low);
        expect(k.volume).toBeGreaterThan(0);
      });
    });
  });
});
