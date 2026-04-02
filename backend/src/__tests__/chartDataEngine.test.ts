import { describe, it, expect } from 'vitest';
import { aggregateKlines, calcBollingerBands, calcRSI, normalizeToRange, OHLCV } from '../services/chartDataEngine';

function makeOHLCV(n: number): OHLCV[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2025-01-${String(i + 1).padStart(2, '0')}`,
    open: 10 + i * 0.1, high: 11 + i * 0.1, low: 9 + i * 0.1, close: 10.5 + i * 0.1, volume: 1000000 + i * 1000
  }));
}

describe('chartDataEngine', () => {
  it('aggregateKlines reduces count', () => {
    const data = makeOHLCV(20);
    expect(aggregateKlines(data, 5).length).toBe(4);
  });
  it('aggregateKlines factor 1 returns same', () => {
    const data = makeOHLCV(10);
    expect(aggregateKlines(data, 1).length).toBe(10);
  });
  it('aggregateKlines preserves first open last close', () => {
    const data = makeOHLCV(5);
    const agg = aggregateKlines(data, 5);
    expect(agg[0].open).toBe(data[0].open);
    expect(agg[0].close).toBe(data[4].close);
  });
  it('aggregateKlines sums volume', () => {
    const data = makeOHLCV(3);
    const agg = aggregateKlines(data, 3);
    expect(agg[0].volume).toBe(data.reduce((a, b) => a + b.volume, 0));
  });
  it('aggregateKlines high is max', () => {
    const data = makeOHLCV(3);
    const agg = aggregateKlines(data, 3);
    expect(agg[0].high).toBe(Math.max(...data.map(d => d.high)));
  });
  it('aggregateKlines low is min', () => {
    const data = makeOHLCV(3);
    const agg = aggregateKlines(data, 3);
    expect(agg[0].low).toBe(Math.min(...data.map(d => d.low)));
  });
  it('calcBollingerBands correct length', () => {
    const bands = calcBollingerBands(Array(30).fill(100), 20, 2);
    expect(bands.length).toBe(11);
  });
  it('bollinger upper > mid > lower for varying data', () => {
    const data = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
    const bands = calcBollingerBands(data, 10, 2);
    bands.forEach(b => {
      expect(b.upper).toBeGreaterThan(b.mid);
      expect(b.mid).toBeGreaterThan(b.lower);
    });
  });
  it('bollinger with constant data has zero width', () => {
    const bands = calcBollingerBands(Array(25).fill(50), 20, 2);
    bands.forEach(b => { expect(b.upper).toBeCloseTo(50); });
  });
  it('calcRSI returns correct length', () => {
    const rsi = calcRSI(Array.from({ length: 30 }, (_, i) => 100 + i), 14);
    expect(rsi.length).toBe(16);
  });
  it('RSI in [0, 100]', () => {
    const data = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 20);
    const rsi = calcRSI(data, 14);
    rsi.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); });
  });
  it('RSI short data returns empty', () => {
    expect(calcRSI([1, 2, 3], 14).length).toBe(0);
  });
  it('RSI all up gives 100', () => {
    const data = Array.from({ length: 20 }, (_, i) => i);
    const rsi = calcRSI(data, 14);
    expect(rsi[rsi.length - 1]).toBeCloseTo(100, 0);
  });
  it('normalizeToRange maps to [min, max]', () => {
    const result = normalizeToRange([1, 2, 3, 4, 5], 0, 100);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(100);
  });
  it('normalizeToRange constant data', () => {
    const result = normalizeToRange([5, 5, 5], 0, 10);
    result.forEach(v => { expect(v).toBe(5); });
  });
  it('normalizeToRange negative values', () => {
    const result = normalizeToRange([-10, 0, 10], -1, 1);
    expect(result[0]).toBeCloseTo(-1);
    expect(result[2]).toBeCloseTo(1);
  });
  it('aggregateKlines partial last group', () => {
    const data = makeOHLCV(7);
    const agg = aggregateKlines(data, 5);
    expect(agg.length).toBe(2);
    expect(agg[1].volume).toBe(data.slice(5).reduce((a, b) => a + b.volume, 0));
  });
  it('bollinger mult 0 gives flat band', () => {
    const bands = calcBollingerBands([1,2,3,4,5,6,7,8,9,10], 5, 0);
    bands.forEach(b => { expect(b.upper).toBe(b.lower); });
  });
  it('RSI mixed data', () => {
    const data = Array.from({ length: 30 }, (_, i) => i % 2 === 0 ? 110 : 100);
    const rsi = calcRSI(data, 14);
    expect(rsi.length).toBeGreaterThan(0);
  });
  it('normalize single element', () => {
    expect(normalizeToRange([42], 0, 100)).toEqual([50]);
  });
});
