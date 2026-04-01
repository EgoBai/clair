import { describe, it, expect } from 'vitest';

/**
 * 技术指标计算模块测试
 * MA/EMA/MACD/RSI/KDJ/布林带
 */

interface OHLCV {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

function calculateMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result.push(parseFloat((sum / period).toFixed(4)));
    }
  }
  return result;
}

function calculateEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result.push(parseFloat((sum / period).toFixed(4)));
    } else {
      const prevEMA = result[i - 1]!;
      const ema = (data[i] - prevEMA) * multiplier + prevEMA;
      result.push(parseFloat(ema.toFixed(4)));
    }
  }
  return result;
}

function calculateMACD(data: number[], shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  const shortEMA = calculateEMA(data, shortPeriod);
  const longEMA = calculateEMA(data, longPeriod);
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (shortEMA[i] === null || longEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(parseFloat((shortEMA[i]! - longEMA[i]!).toFixed(4)));
    }
  }
  const validMacd = macdLine.filter(v => v !== null) as number[];
  const signalEMA = calculateEMA(validMacd, signalPeriod);
  const signalLine: (number | null)[] = [];
  let si = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) {
      signalLine.push(null);
    } else {
      signalLine.push(signalEMA[si++] ?? null);
    }
  }
  const histogram: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] === null || signalLine[i] === null) {
      histogram.push(null);
    } else {
      histogram.push(parseFloat((macdLine[i]! - signalLine[i]!).toFixed(4)));
    }
  }
  return { macd: macdLine, signal: signalLine, histogram };
}

function calculateRSI(data: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(null);
    } else {
      let gains = 0, losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = data[j] - data[j - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(parseFloat((100 - 100 / (1 + rs)).toFixed(4)));
      }
    }
  }
  return result;
}

function calculateKDJ(data: OHLCV[], n = 9, m1 = 3, m2 = 3) {
  const K: (number | null)[] = [];
  const D: (number | null)[] = [];
  const J: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < n - 1) {
      K.push(null); D.push(null); J.push(null);
    } else {
      let highest = -Infinity, lowest = Infinity;
      for (let j = i - n + 1; j <= i; j++) {
        highest = Math.max(highest, data[j].high);
        lowest = Math.min(lowest, data[j].low);
      }
      const rsv = highest === lowest ? 50 : ((data[i].close - lowest) / (highest - lowest)) * 100;
      const prevK = K[i - 1] ?? 50;
      const prevD = D[i - 1] ?? 50;
      const k = (2 / m1) * prevK + (1 / m1) * rsv;
      const d = (2 / m2) * prevD + (1 / m2) * k;
      const j = 3 * k - 2 * d;
      K.push(parseFloat(k.toFixed(4)));
      D.push(parseFloat(d.toFixed(4)));
      J.push(parseFloat(j.toFixed(4)));
    }
  }
  return { K, D, J };
}

function calculateBollingerBands(data: number[], period = 20, multiplier = 2) {
  const middle = calculateMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (middle[i] === null) {
      upper.push(null); lower.push(null);
    } else {
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sumSq += (data[j] - middle[i]!) ** 2;
      }
      const std = Math.sqrt(sumSq / period);
      upper.push(parseFloat((middle[i]! + multiplier * std).toFixed(4)));
      lower.push(parseFloat((middle[i]! - multiplier * std).toFixed(4)));
    }
  }
  return { upper, middle, lower };
}

describe('技术指标计算', () => {
  const prices = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20, 19, 21, 22, 21, 23];

  describe('calculateMA', () => {
    it('should return null for insufficient data', () => {
      const ma = calculateMA([1, 2], 5);
      expect(ma).toEqual([null, null]);
    });

    it('should calculate MA correctly', () => {
      const ma = calculateMA([10, 20, 30, 40, 50], 3);
      expect(ma[0]).toBeNull();
      expect(ma[1]).toBeNull();
      expect(ma[2]).toBe(20); // (10+20+30)/3
      expect(ma[3]).toBe(30); // (20+30+40)/3
      expect(ma[4]).toBe(40); // (30+40+50)/3
    });

    it('should have correct length', () => {
      const ma = calculateMA(prices, 5);
      expect(ma.length).toBe(prices.length);
    });

    it('should calculate MA5 from real data', () => {
      const ma = calculateMA(prices, 5);
      // First 4 should be null
      for (let i = 0; i < 4; i++) expect(ma[i]).toBeNull();
      // 5th: (10+11+12+11+13)/5 = 11.4
      expect(ma[4]).toBe(11.4);
    });
  });

  describe('calculateEMA', () => {
    it('should return null for insufficient data', () => {
      const ema = calculateEMA([1, 2], 3);
      expect(ema).toEqual([null, null]);
    });

    it('should use SMA for first EMA value', () => {
      const ema = calculateEMA([10, 20, 30], 3);
      expect(ema[2]).toBe(20); // (10+20+30)/3
    });

    it('should calculate subsequent EMA values', () => {
      const ema = calculateEMA([10, 20, 30, 40], 3);
      expect(ema[2]).toBe(20);
      // EMA[3] = (40-20) * (2/4) + 20 = 10 + 20 = 30
      expect(ema[3]).toBe(30);
    });
  });

  describe('calculateMACD', () => {
    it('should return nulls for insufficient data', () => {
      const macd = calculateMACD([1, 2, 3], 12, 26, 9);
      expect(macd.macd.every(v => v === null)).toBe(true);
    });

    it('should have correct structure', () => {
      const macd = calculateMACD(prices, 3, 5, 3);
      expect(macd.macd.length).toBe(prices.length);
      expect(macd.signal.length).toBe(prices.length);
      expect(macd.histogram.length).toBe(prices.length);
    });

    it('histogram should equal macd minus signal', () => {
      const macd = calculateMACD(prices, 3, 5, 3);
      for (let i = 0; i < prices.length; i++) {
        if (macd.macd[i] !== null && macd.signal[i] !== null) {
          expect(macd.histogram[i]).toBeCloseTo(macd.macd[i]! - macd.signal[i]!, 4);
        }
      }
    });
  });

  describe('calculateRSI', () => {
    it('should return null for insufficient data', () => {
      const rsi = calculateRSI([1, 2, 3], 14);
      expect(rsi.every(v => v === null)).toBe(true);
    });

    it('should return 100 when no losses', () => {
      const rising = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
      const rsi = calculateRSI(rising, 14);
      expect(rsi[14]).toBe(100);
    });

    it('should be between 0 and 100', () => {
      const rsi = calculateRSI(prices, 5);
      for (const v of rsi) {
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('calculateKDJ', () => {
    const ohlcv: OHLCV[] = prices.map((close, i) => ({
      tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: close - 0.5,
      close,
      high: close + 1,
      low: close - 1,
      volume: 1000000,
    }));

    it('should return nulls for insufficient data', () => {
      const kdj = calculateKDJ(ohlcv.slice(0, 3), 9);
      expect(kdj.K.every(v => v === null)).toBe(true);
    });

    it('should have K, D, J arrays of correct length', () => {
      const kdj = calculateKDJ(ohlcv, 5);
      expect(kdj.K.length).toBe(ohlcv.length);
      expect(kdj.D.length).toBe(ohlcv.length);
      expect(kdj.J.length).toBe(ohlcv.length);
    });

    it('J should equal 3K - 2D', () => {
      const kdj = calculateKDJ(ohlcv, 5);
      for (let i = 0; i < ohlcv.length; i++) {
        if (kdj.K[i] !== null && kdj.D[i] !== null) {
          expect(kdj.J[i]).toBeCloseTo(3 * kdj.K[i]! - 2 * kdj.D[i]!, 3);
        }
      }
    });
  });

  describe('calculateBollingerBands', () => {
    it('should return nulls for insufficient data', () => {
      const boll = calculateBollingerBands([1, 2, 3], 20);
      expect(boll.upper.every(v => v === null)).toBe(true);
    });

    it('upper should be above middle, lower below', () => {
      const boll = calculateBollingerBands(prices, 5);
      for (let i = 0; i < prices.length; i++) {
        if (boll.middle[i] !== null) {
          expect(boll.upper[i]!).toBeGreaterThan(boll.middle[i]!);
          expect(boll.lower[i]!).toBeLessThan(boll.middle[i]!);
        }
      }
    });

    it('middle should equal MA', () => {
      const boll = calculateBollingerBands(prices, 5);
      const ma = calculateMA(prices, 5);
      for (let i = 0; i < prices.length; i++) {
        expect(boll.middle[i]).toBe(ma[i]);
      }
    });
  });
});
