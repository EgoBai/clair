import { describe, it, expect } from 'vitest';
import { classifyTrade, orderImbalance, calcVPIN, tradeIntensity, Trade } from '../services/orderFlowToxicityEngine';

function makeTrades(n: number, startPrice: number): Trade[] {
  return Array.from({ length: n }, (_, i) => ({
    price: startPrice + (i % 2 === 0 ? 0.01 : -0.01),
    volume: 100 + i * 10,
    timestamp: i * 1000,
  }));
}

describe('orderFlowToxicityEngine', () => {
  it('classifyTrade BUY on price up', () => { expect(classifyTrade({ price: 10.01, volume: 100, timestamp: 0 }, 10)).toBe('BUY'); });
  it('classifyTrade SELL on price down', () => { expect(classifyTrade({ price: 9.99, volume: 100, timestamp: 0 }, 10)).toBe('SELL'); });
  it('classifyTrade BUY on equal price', () => { expect(classifyTrade({ price: 10, volume: 100, timestamp: 0 }, 10)).toBe('BUY'); });
  it('orderImbalance returns [-1, 1]', () => {
    const ib = orderImbalance(makeTrades(20, 100));
    expect(ib).toBeGreaterThanOrEqual(-1);
    expect(ib).toBeLessThanOrEqual(1);
  });
  it('orderImbalance single trade', () => { expect(orderImbalance([{ price: 10, volume: 100, timestamp: 0 }])).toBe(0); });
  it('orderImbalance all buys', () => {
    const trades: Trade[] = [{ price: 10, volume: 100, timestamp: 0 }];
    for (let i = 0; i < 10; i++) trades.push({ price: 10 + i + 1, volume: 100, timestamp: i + 1 });
    expect(orderImbalance(trades)).toBeGreaterThan(0.5);
  });
  it('orderImbalance all sells', () => {
    const trades: Trade[] = [{ price: 20, volume: 100, timestamp: 0 }];
    for (let i = 0; i < 10; i++) trades.push({ price: 20 - i - 1, volume: 100, timestamp: i + 1 });
    expect(orderImbalance(trades)).toBeLessThan(-0.5);
  });
  it('calcVPIN returns array', () => {
    const vpin = calcVPIN(makeTrades(100, 100), 500);
    expect(Array.isArray(vpin)).toBe(true);
  });
  it('calcVPIN values in [0, 1]', () => {
    const vpin = calcVPIN(makeTrades(100, 100), 200);
    vpin.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); });
  });
  it('calcVPIN short trades', () => { expect(calcVPIN([{ price: 10, volume: 100, timestamp: 0 }], 500).length).toBe(0); });
  it('calcVPIN large bucket fewer buckets', () => {
    const small = calcVPIN(makeTrades(50, 100), 100);
    const large = calcVPIN(makeTrades(50, 100), 10000);
    expect(large.length).toBeLessThanOrEqual(small.length);
  });
  it('tradeIntensity returns correct length', () => {
    const ti = tradeIntensity(makeTrades(10, 100), 5000);
    expect(ti.length).toBe(10);
  });
  it('tradeIntensity empty', () => { expect(tradeIntensity([], 1000).length).toBe(0); });
  it('tradeIntensity increasing with window', () => {
    const trades = makeTrades(20, 100);
    const t1 = tradeIntensity(trades, 1000);
    const t2 = tradeIntensity(trades, 5000);
    expect(t2[t2.length - 1]).toBeGreaterThanOrEqual(t1[t1.length - 1]);
  });
  it('orderImbalance zero volume trades', () => {
    const trades: Trade[] = [{ price: 10, volume: 0, timestamp: 0 }, { price: 11, volume: 0, timestamp: 1 }];
    expect(orderImbalance(trades)).toBe(0);
  });
  it('calcVPIN with consistent direction', () => {
    const trades: Trade[] = [{ price: 10, volume: 100, timestamp: 0 }];
    for (let i = 1; i < 50; i++) trades.push({ price: 10 + i, volume: 100, timestamp: i });
    const vpin = calcVPIN(trades, 500);
    vpin.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); });
  });
  it('tradeIntensity single trade', () => {
    const ti = tradeIntensity([{ price: 10, volume: 100, timestamp: 0 }], 1000);
    expect(ti).toEqual([1]);
  });
  it('classifyTrade handles decimals', () => {
    expect(classifyTrade({ price: 10.001, volume: 100, timestamp: 0 }, 10)).toBe('BUY');
  });
  it('orderImbalance balanced trades', () => {
    const trades: Trade[] = [
      { price: 10, volume: 100, timestamp: 0 },
      { price: 10.01, volume: 100, timestamp: 1 },
      { price: 10, volume: 100, timestamp: 2 },
      { price: 10.01, volume: 100, timestamp: 3 },
    ];
    expect(Math.abs(orderImbalance(trades))).toBeLessThan(0.5);
  });
  it('calcVPIN zero volume', () => {
    const trades: Trade[] = [{ price: 10, volume: 0, timestamp: 0 }, { price: 11, volume: 0, timestamp: 1 }];
    expect(calcVPIN(trades, 100).length).toBe(0);
  });
});
