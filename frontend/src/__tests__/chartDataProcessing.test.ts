import { describe, it, expect } from 'vitest';
import {
  aggregateTicksToCandle,
  downsampleData,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
} from '../utils/chartDataProcessing';

describe('aggregateTicksToCandle', () => {
  it('should aggregate ticks into candles', () => {
    const ticks = [
      { price: 10, volume: 100, timestamp: 1000 },
      { price: 11, volume: 200, timestamp: 1500 },
      { price: 9, volume: 150, timestamp: 1800 },
    ];
    const candles = aggregateTicksToCandle(ticks, 1000);
    expect(candles).toHaveLength(1);
    expect(candles[0].open).toBe(10);
    expect(candles[0].high).toBe(11);
    expect(candles[0].low).toBe(9);
    expect(candles[0].close).toBe(9);
    expect(candles[0].volume).toBe(450);
  });

  it('should split across intervals', () => {
    const ticks = [
      { price: 10, volume: 100, timestamp: 500 },
      { price: 12, volume: 200, timestamp: 1500 },
    ];
    const candles = aggregateTicksToCandle(ticks, 1000);
    expect(candles).toHaveLength(2);
  });

  it('should return empty for no ticks', () => {
    expect(aggregateTicksToCandle([], 1000)).toHaveLength(0);
  });
});

describe('downsampleData', () => {
  it('should reduce data points', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ timestamp: i, value: i }));
    const result = downsampleData(data, 10);
    expect(result.length).toBeLessThanOrEqual(11);
  });

  it('should return original if under limit', () => {
    const data = [{ timestamp: 0 }, { timestamp: 1 }];
    expect(downsampleData(data, 10)).toHaveLength(2);
  });
});

describe('calculateSMA', () => {
  it('should calculate simple moving average', () => {
    const result = calculateSMA([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2);
    expect(result[3]).toBe(3);
    expect(result[4]).toBe(4);
  });

  it('should return all null for short data', () => {
    const result = calculateSMA([1, 2], 5);
    expect(result.every(v => v === null)).toBe(true);
  });
});

describe('calculateEMA', () => {
  it('should calculate exponential moving average', () => {
    const result = calculateEMA([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2); // first EMA = SMA
    expect(result[3]).toBeGreaterThan(2);
  });
});

describe('calculateRSI', () => {
  it('should calculate RSI', () => {
    const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
    const result = calculateRSI(closes, 14);
    expect(result[14]).not.toBeNull();
    expect(result[14]!).toBeGreaterThan(0);
    expect(result[14]!).toBeLessThanOrEqual(100);
  });

  it('should return nulls for insufficient data', () => {
    const result = calculateRSI([1, 2, 3], 14);
    expect(result.every(v => v === null)).toBe(true);
  });
});

describe('calculateBollingerBands', () => {
  it('should calculate bands', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5);
    const result = calculateBollingerBands(closes, 20);
    expect(result[0]).toBeNull();
    expect(result[19]).not.toBeNull();
    expect(result[19]!.upper).toBeGreaterThan(result[19]!.middle);
    expect(result[19]!.lower).toBeLessThan(result[19]!.middle);
  });

  it('should return nulls for short data', () => {
    const result = calculateBollingerBands([1, 2, 3], 20);
    expect(result.every(v => v === null)).toBe(true);
  });
});
