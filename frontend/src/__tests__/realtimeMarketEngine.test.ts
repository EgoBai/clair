import { describe, it, expect } from 'vitest';

// 实时行情处理引擎
interface TickData {
  symbol: string; price: number; volume: number;
  bid1: number; ask1: number; bidVol1: number; askVol1: number;
  high: number; low: number; open: number; prevClose: number;
}

function calcChangePercent(price: number, prevClose: number): number {
  if (prevClose <= 0) return 0;
  return ((price - prevClose) / prevClose) * 100;
}

function calcAmplitude(high: number, low: number, prevClose: number): number {
  if (prevClose <= 0) return 0;
  return ((high - low) / prevClose) * 100;
}

function calcBidAskSpread(bid: number, ask: number): number {
  if (bid <= 0 || ask <= 0) return 0;
  return ask - bid;
}

function calcOrderBookImbalance(bidVol: number, askVol: number): number {
  const total = bidVol + askVol;
  return total > 0 ? (bidVol - askVol) / total : 0;
}

function determinePriceLimit(prevClose: number, isST: boolean): { upper: number; lower: number } {
  const pct = isST ? 0.05 : 0.1;
  return {
    upper: Math.round(prevClose * (1 + pct) * 100) / 100,
    lower: Math.round(prevClose * (1 - pct) * 100) / 100,
  };
}

function isPriceAtLimit(price: number, prevClose: number, isST: boolean): { atUpper: boolean; atLower: boolean } {
  const limits = determinePriceLimit(prevClose, isST);
  return {
    atUpper: Math.abs(price - limits.upper) < 0.01,
    atLower: Math.abs(price - limits.lower) < 0.01,
  };
}

function calcVolumeWeightedPrice(ticks: { price: number; volume: number }[]): number {
  const totalValue = ticks.reduce((s, t) => s + t.price * t.volume, 0);
  const totalVol = ticks.reduce((s, t) => s + t.volume, 0);
  return totalVol > 0 ? totalValue / totalVol : 0;
}

function calcNetInflow(ticks: { price: number; prevPrice: number; volume: number }[]): number {
  return ticks.reduce((s, t) => {
    if (t.price > t.prevPrice) return s + t.price * t.volume;
    if (t.price < t.prevPrice) return s - t.price * t.volume;
    return s;
  }, 0);
}

describe('实时行情处理引擎', () => {
  describe('涨跌幅计算', () => {
    it('应正确计算涨跌幅', () => {
      expect(calcChangePercent(11, 10)).toBe(10);
      expect(calcChangePercent(9, 10)).toBe(-10);
    });

    it('昨收为零应返回0', () => { expect(calcChangePercent(10, 0)).toBe(0); });

    it('涨停应返回+10%', () => { expect(calcChangePercent(11, 10)).toBe(10); });
  });

  describe('振幅计算', () => {
    it('应正确计算振幅', () => {
      expect(calcAmplitude(12, 10, 10)).toBe(20);
    });

    it('昨收为零应返回0', () => { expect(calcAmplitude(12, 10, 0)).toBe(0); });
  });

  describe('买卖价差', () => {
    it('应计算spread', () => { expect(calcBidAskSpread(10.00, 10.02)).toBeCloseTo(0.02); });
    it('任一为零应返回0', () => { expect(calcBidAskSpread(0, 10)).toBe(0); });
  });

  describe('委托单不平衡度', () => {
    it('买卖相等应为0', () => { expect(calcOrderBookImbalance(100, 100)).toBe(0); });
    it('买多应为正', () => { expect(calcOrderBookImbalance(200, 100)).toBeGreaterThan(0); });
    it('卖多应为负', () => { expect(calcOrderBookImbalance(100, 200)).toBeLessThan(0); });
    it('总量为零应为0', () => { expect(calcOrderBookImbalance(0, 0)).toBe(0); });
  });

  describe('涨跌停价计算', () => {
    it('非ST股涨跌停±10%', () => {
      const limits = determinePriceLimit(10, false);
      expect(limits.upper).toBe(11);
      expect(limits.lower).toBe(9);
    });

    it('ST股涨跌停±5%', () => {
      const limits = determinePriceLimit(10, true);
      expect(limits.upper).toBe(10.5);
      expect(limits.lower).toBe(9.5);
    });
  });

  describe('涨跌停判定', () => {
    it('价格等于涨停价应标记atUpper', () => {
      expect(isPriceAtLimit(11, 10, false).atUpper).toBe(true);
    });

    it('价格等于跌停价应标记atLower', () => {
      expect(isPriceAtLimit(9, 10, false).atLower).toBe(true);
    });

    it('正常价格不应触发涨跌停', () => {
      const result = isPriceAtLimit(10.5, 10, false);
      expect(result.atUpper).toBe(false);
      expect(result.atLower).toBe(false);
    });
  });

  describe('量加权均价', () => {
    it('应正确计算VWAP', () => {
      const ticks = [{ price: 10, volume: 100 }, { price: 12, volume: 200 }];
      expect(calcVolumeWeightedPrice(ticks)).toBeCloseTo(11.333, 2);
    });

    it('空数据应返回0', () => { expect(calcVolumeWeightedPrice([])).toBe(0); });
  });

  describe('资金净流入', () => {
    it('上涨为主应为净流入', () => {
      const ticks = [{ price: 11, prevPrice: 10, volume: 100 }, { price: 12, prevPrice: 11, volume: 100 }];
      expect(calcNetInflow(ticks)).toBeGreaterThan(0);
    });

    it('下跌为主应为净流出', () => {
      const ticks = [{ price: 9, prevPrice: 10, volume: 100 }, { price: 8, prevPrice: 9, volume: 100 }];
      expect(calcNetInflow(ticks)).toBeLessThan(0);
    });

    it('价格不变应为0', () => {
      const ticks = [{ price: 10, prevPrice: 10, volume: 100 }];
      expect(calcNetInflow(ticks)).toBe(0);
    });
  });
});
