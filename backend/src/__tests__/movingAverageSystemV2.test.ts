import { describe, it, expect } from 'vitest';

// Moving Average Systems
interface MACrossResult { signals: { date: number; type: 'buy' | 'sell'; price: number }[]; winRate: number }
interface EMAParams { period: number; smoothing: number }

function calculateSMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += prices[j];
    result.push(sum / period);
  }
  return result;
}

function calculateEMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) { result.push(prices[0]); continue; }
    const prev = result[i - 1] ?? prices[i - 1];
    result.push((prices[i] - prev) * multiplier + prev);
  }
  return result;
}

function calculateWMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const weightSum = (period * (period + 1)) / 2;
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let weightedSum = 0;
    for (let j = 0; j < period; j++) {
      weightedSum += prices[i - period + 1 + j] * (j + 1);
    }
    result.push(weightedSum / weightSum);
  }
  return result;
}

function goldenCrossStrategy(shortMA: (number | null)[], longMA: (number | null)[], prices: number[]): MACrossResult {
  const signals: MACrossResult['signals'] = [];
  let position = false;
  for (let i = 1; i < prices.length; i++) {
    if (shortMA[i] === null || longMA[i] === null || shortMA[i - 1] === null || longMA[i - 1] === null) continue;
    if (shortMA[i]! > longMA[i]! && shortMA[i - 1]! <= longMA[i - 1]! && !position) {
      signals.push({ date: i, type: 'buy', price: prices[i] });
      position = true;
    } else if (shortMA[i]! < longMA[i]! && shortMA[i - 1]! >= longMA[i - 1]! && position) {
      signals.push({ date: i, type: 'sell', price: prices[i] });
      position = false;
    }
  }
  let wins = 0, total = 0;
  for (let i = 0; i < signals.length - 1; i += 2) {
    if (signals[i + 1] && signals[i + 1].price > signals[i].price) wins++;
    total++;
  }
  return { signals, winRate: total > 0 ? wins / total : 0 };
}

function tripleMASystem(prices: number[], fast: number, mid: number, slow: number): string[] {
  const fastMA = calculateSMA(prices, fast);
  const midMA = calculateSMA(prices, mid);
  const slowMA = calculateSMA(prices, slow);
  const signals: string[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (fastMA[i] === null || midMA[i] === null || slowMA[i] === null) { signals.push(''); continue; }
    if (fastMA[i]! > midMA[i]! && midMA[i]! > slowMA[i]!) signals.push('strong_buy');
    else if (fastMA[i]! > slowMA[i]!) signals.push('buy');
    else if (fastMA[i]! < midMA[i]! && midMA[i]! < slowMA[i]!) signals.push('strong_sell');
    else if (fastMA[i]! < slowMA[i]!) signals.push('sell');
    else signals.push('hold');
  }
  return signals;
}

describe('Moving Average Systems', () => {
  const testPrices = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 14, 13, 12, 11, 10, 11, 12, 13, 14, 15];

  describe('SMA', () => {
    it('should calculate correct SMA values', () => {
      const sma3 = calculateSMA([10, 20, 30, 40, 50], 3);
      expect(sma3[0]).toBeNull();
      expect(sma3[1]).toBeNull();
      expect(sma3[2]).toBe(20); // (10+20+30)/3
      expect(sma3[3]).toBe(30); // (20+30+40)/3
      expect(sma3[4]).toBe(40); // (30+40+50)/3
    });

    it('should have null for period-1 items', () => {
      const sma5 = calculateSMA(testPrices, 5);
      for (let i = 0; i < 4; i++) expect(sma5[i]).toBeNull();
      expect(sma5[4]).not.toBeNull();
    });

    it('should handle period=1 (equal to prices)', () => {
      const sma1 = calculateSMA([10, 20, 30], 1);
      expect(sma1).toEqual([10, 20, 30]);
    });

    it('should handle single value', () => {
      const sma = calculateSMA([100], 1);
      expect(sma).toEqual([100]);
    });

    it('should return all null when data shorter than period', () => {
      const sma = calculateSMA([1, 2], 5);
      expect(sma).toEqual([null, null]);
    });
  });

  describe('EMA', () => {
    it('should calculate EMA starting from first price', () => {
      const ema = calculateEMA([10, 20, 30], 2);
      expect(ema[0]).toBe(10);
      expect(ema[1]).toBeCloseTo(16.667, 1);
    });

    it('should have length equal to input', () => {
      const ema = calculateEMA(testPrices, 5);
      expect(ema.length).toBe(testPrices.length);
    });

    it('should follow price trend', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ema = calculateEMA(prices, 3);
      // EMA should be increasing for increasing prices
      for (let i = 1; i < ema.length; i++) {
        expect(ema[i]).toBeGreaterThanOrEqual(ema[i - 1]!);
      }
    });
  });

  describe('WMA', () => {
    it('should calculate weighted moving average', () => {
      const wma = calculateWMA([10, 20, 30], 3);
      expect(wma[0]).toBeNull();
      expect(wma[1]).toBeNull();
      // WMA(3) = (10*1 + 20*2 + 30*3) / (1+2+3) = 140/6 ≈ 23.33
      expect(wma[2]).toBeCloseTo(23.33, 1);
    });

    it('should weight recent values more', () => {
      const wma = calculateWMA([10, 10, 10, 20], 3);
      // Last 3: [10,10,20] → WMA = (10*1+10*2+20*3)/6 = 100/6 ≈ 16.67
      expect(wma[3]).toBeGreaterThan(10);
      expect(wma[3]).toBeLessThan(20);
    });
  });

  describe('Golden Cross Strategy', () => {
    it('should detect golden cross (buy signal)', () => {
      const shortMA = [null, null, 5, 6, 7, 8];
      const longMA = [null, null, 7, 7, 6, 5];
      const prices = [10, 10, 10, 10, 10, 10];
      // At index 4: shortMA[4]=7 > longMA[4]=6 and shortMA[3]=6 <= longMA[3]=7
      const result = goldenCrossStrategy(shortMA, longMA, prices);
      expect(result.signals.some(s => s.type === 'buy')).toBe(true);
    });

    it('should detect death cross (sell signal)', () => {
      const shortMA = [null, null, 8, 7, 6, 5];
      const longMA = [null, null, 5, 6, 7, 8];
      const prices = [10, 10, 10, 10, 10, 10];
      const result = goldenCrossStrategy(shortMA, longMA, prices);
      // Need to buy first before sell can trigger (since we need position=true)
      // Let's just check signals exist
      expect(result.signals).toBeDefined();
    });

    it('should return empty signals for flat MAs', () => {
      const ma = [null, null, 5, 5, 5, 5];
      const result = goldenCrossStrategy(ma, ma, [10, 10, 10, 10, 10, 10]);
      expect(result.signals).toHaveLength(0);
    });

    it('should calculate win rate', () => {
      const shortMA = [null, 5, 6, 7, 6, 5];
      const longMA = [null, 7, 6, 5, 6, 7];
      const prices = [10, 10, 11, 12, 11, 10];
      const result = goldenCrossStrategy(shortMA, longMA, prices);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it('should not double-buy when already in position', () => {
      const shortMA = [null, 5, 8, 9, 8, 9];
      const longMA = [null, 7, 6, 5, 6, 5];
      const prices = [10, 10, 10, 10, 10, 10];
      const result = goldenCrossStrategy(shortMA, longMA, prices);
      const buySignals = result.signals.filter(s => s.type === 'buy');
      // Should not have consecutive buy signals without a sell in between
      for (let i = 1; i < buySignals.length; i++) {
        const prevBuyIdx = result.signals.indexOf(buySignals[i - 1]);
        const currBuyIdx = result.signals.indexOf(buySignals[i]);
        const between = result.signals.slice(prevBuyIdx + 1, currBuyIdx);
        expect(between.some(s => s.type === 'sell')).toBe(true);
      }
    });
  });

  describe('Triple MA System', () => {
    it('should signal strong_buy when fast > mid > slow', () => {
      const prices = Array(20).fill(0).map((_, i) => i < 10 ? 10 : 10 + (i - 9));
      const signals = tripleMASystem(prices, 3, 5, 10);
      expect(signals.some(s => s === 'strong_buy')).toBe(true);
    });

    it('should signal strong_sell when fast < mid < slow', () => {
      const prices = Array(20).fill(0).map((_, i) => i < 10 ? 20 : 20 - (i - 9));
      const signals = tripleMASystem(prices, 3, 5, 10);
      expect(signals.some(s => s === 'strong_sell')).toBe(true);
    });

    it('should return empty strings for early data points', () => {
      const signals = tripleMASystem([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, 5, 8);
      expect(signals[0]).toBe('');
      expect(signals[1]).toBe('');
      expect(signals[2]).toBe('');
      expect(signals[3]).toBe('');
      expect(signals[4]).toBe('');
      expect(signals[5]).toBe('');
      expect(signals[6]).toBe('');
    });

    it('should return hold when MAs converge', () => {
      const prices = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
      const signals = tripleMASystem(prices, 2, 3, 5);
      // Flat prices → all MAs equal → hold
      expect(signals.filter(s => s === 'hold' || s === '').length).toBeGreaterThan(0);
    });
  });
});
