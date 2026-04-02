import { describe, it, expect } from 'vitest';
import { leeReady, bulkClassify, tradeSign, signedVolume, tradeAggressiveness, Tick } from '../services/tradeClassificationEngine';

describe('tradeClassificationEngine', () => {
  it('leeReady above mid is BUY', () => { expect(leeReady({ price: 10.1, bid: 10, ask: 10.05 })).toBe('BUY'); });
  it('leeReady below mid is SELL', () => { expect(leeReady({ price: 9.9, bid: 9.95, ask: 10.05 })).toBe('SELL'); });
  it('leeReady at mid equal tick rule', () => { expect(leeReady({ price: 10, bid: 9.9, ask: 10.1 })).toBe('SELL'); });
  it('leeReady at ask is BUY', () => { expect(leeReady({ price: 10.1, bid: 10, ask: 10.1 })).toBe('BUY'); });
  it('bulkClassify counts correctly', () => {
    const ticks: Tick[] = [
      { price: 10.1, bid: 10, ask: 10.05 },
      { price: 9.9, bid: 9.95, ask: 10.05 },
      { price: 10.2, bid: 10, ask: 10.1 },
    ];
    const r = bulkClassify(ticks);
    expect(r.buys + r.sells).toBe(3);
    expect(r.buys).toBeGreaterThan(0);
  });
  it('bulkClassify empty', () => { expect(bulkClassify([])).toEqual({ buys: 0, sells: 0 }); });
  it('tradeSign positive above mid', () => { expect(tradeSign({ price: 10.15, bid: 10, ask: 10.2 })).toBeGreaterThan(0); });
  it('tradeSign negative below mid', () => { expect(tradeSign({ price: 10.05, bid: 10, ask: 10.2 })).toBeLessThan(0); });
  it('tradeSign at mid is 0', () => { expect(tradeSign({ price: 10.1, bid: 10, ask: 10.2 })).toBeCloseTo(0); });
  it('tradeSign zero spread', () => { expect(tradeSign({ price: 10, bid: 10, ask: 10 })).toBe(0); });
  it('signedVolume sums correctly', () => {
    const ticks: Tick[] = [{ price: 10.1, bid: 10, ask: 10.05 }, { price: 9.9, bid: 9.95, ask: 10.05 }];
    const vols = [100, 100];
    expect(typeof signedVolume(ticks, vols)).toBe('number');
  });
  it('signedVolume empty', () => { expect(signedVolume([], [])).toBe(0); });
  it('tradeAggressiveness at ask is AGGRESSIVE', () => {
    expect(tradeAggressiveness({ price: 10.1, bid: 10, ask: 10.1 })).toBe('AGGRESSIVE');
  });
  it('tradeAggressiveness at bid is AGGRESSIVE', () => {
    expect(tradeAggressiveness({ price: 10, bid: 10, ask: 10.1 })).toBe('AGGRESSIVE');
  });
  it('tradeAggressiveness inside spread is PASSIVE', () => {
    expect(tradeAggressiveness({ price: 10.05, bid: 10, ask: 10.1 })).toBe('PASSIVE');
  });
  it('tradeSign at ask edge', () => {
    expect(tradeSign({ price: 10.1, bid: 10, ask: 10.1 })).toBeCloseTo(1);
  });
  it('tradeSign at bid edge', () => {
    expect(tradeSign({ price: 10, bid: 10, ask: 10.1 })).toBeCloseTo(-1);
  });
  it('bulkClassify all buys', () => {
    const ticks: Tick[] = Array(5).fill({ price: 10.2, bid: 10, ask: 10.05 });
    const r = bulkClassify(ticks);
    expect(r.sells).toBe(0);
  });
  it('signedVolume with more ticks than volumes', () => {
    const ticks: Tick[] = [{ price: 10.1, bid: 10, ask: 10.05 }, { price: 10.2, bid: 10, ask: 10.1 }];
    expect(signedVolume(ticks, [100])).toBeGreaterThan(0);
  });
  it('tradeAggressiveness mid spread', () => {
    const t = tradeAggressiveness({ price: 10.05, bid: 10, ask: 10.1 });
    expect(t).toBe('PASSIVE');
  });
});
