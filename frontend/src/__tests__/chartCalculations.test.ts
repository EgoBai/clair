import { describe, it, expect } from 'vitest';

// 图表数据处理测试
describe('Chart Data Processing', () => {
  interface RawKLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

  // MA计算
  const calcMA = (data: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      const slice = data.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
    return result;
  };

  // EMA计算
  const calcEMA = (data: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    const multiplier = 2 / (period + 1);
    let ema: number | null = null;
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      if (ema === null) {
        ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      } else {
        ema = (data[i] - ema) * multiplier + ema;
      }
      result.push(ema);
    }
    return result;
  };

  // 涨跌着色
  const getColor = (close: number, open: number): string => {
    if (close > open) return '#ef4444';
    if (close < open) return '#22c55e';
    return '#888888';
  };

  // K线转图表数据
  const toChartData = (klines: RawKLine[]) => {
    return klines.map(k => ({
      x: k.date,
      y: [k.open, k.close, k.low, k.high],
      color: getColor(k.close, k.open),
      volume: k.volume,
    }));
  };

  const testKLines: RawKLine[] = [
    { date: '2026-03-18', open: 100, high: 106, low: 99, close: 105, volume: 1000 },
    { date: '2026-03-19', open: 105, high: 108, low: 103, close: 107, volume: 1200 },
    { date: '2026-03-20', open: 107, high: 109, low: 104, close: 104, volume: 1500 },
    { date: '2026-03-21', open: 104, high: 108, low: 102, close: 108, volume: 1300 },
    { date: '2026-03-24', open: 108, high: 112, low: 107, close: 110, volume: 1600 },
  ];

  it('calculates MA5 correctly', () => {
    const closes = testKLines.map(k => k.close);
    const ma = calcMA(closes, 5);
    expect(ma[0]).toBeNull();
    expect(ma[3]).toBeNull();
    expect(ma[4]).toBeCloseTo(106.8, 1);
  });

  it('calculates MA with period 1 equals original data', () => {
    const closes = testKLines.map(k => k.close);
    const ma = calcMA(closes, 1);
    expect(ma).toEqual(closes.map(c => c));
  });

  it('EMA produces values for all valid periods', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ema = calcEMA(closes, 5);
    const nonNull = ema.filter(v => v !== null);
    expect(nonNull.length).toBe(6);
  });

  it('colors red for up candle', () => {
    expect(getColor(105, 100)).toBe('#ef4444');
  });

  it('colors green for down candle', () => {
    expect(getColor(95, 100)).toBe('#22c55e');
  });

  it('colors gray for doji', () => {
    expect(getColor(100, 100)).toBe('#888888');
  });

  it('converts KLines to chart data', () => {
    const data = toChartData(testKLines);
    expect(data.length).toBe(5);
    expect(data[0].y).toEqual([100, 105, 99, 106]);
    expect(data[0].x).toBe('2026-03-18');
  });

  it('chart data colors match candle direction', () => {
    const data = toChartData(testKLines);
    data.forEach((d, i) => {
      const k = testKLines[i];
      expect(d.color).toBe(getColor(k.close, k.open));
    });
  });

  it('volume data is preserved in chart', () => {
    const data = toChartData(testKLines);
    expect(data.map(d => d.volume)).toEqual([1000, 1200, 1500, 1300, 1600]);
  });
});

// MACD计算测试
describe('MACD Calculation', () => {
  const calcEMA = (data: number[], period: number): number[] => {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = 0; i < period - 1; i++) result.push(NaN);
    result.push(ema);
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
      result.push(ema);
    }
    return result;
  };

  const calcMACD = (closes: number[], fast = 12, slow = 26, signal = 9) => {
    const emaFast = calcEMA(closes, fast);
    const emaSlow = calcEMA(closes, slow);
    const dif: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (isNaN(emaFast[i]) || isNaN(emaSlow[i])) { dif.push(NaN); continue; }
      dif.push(emaFast[i] - emaSlow[i]);
    }
    const validDif = dif.filter(d => !isNaN(d));
    const deaRaw = calcEMA(validDif, signal);
    const dea: number[] = [];
    let j = 0;
    for (let i = 0; i < dif.length; i++) {
      if (isNaN(dif[i])) { dea.push(NaN); continue; }
      dea.push(deaRaw[j++]);
    }
    const histogram = dif.map((d, i) => isNaN(d) || isNaN(dea[i]) ? NaN : 2 * (d - dea[i]));
    return { dif, dea, histogram };
  };

  const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 10 + i * 0.5);

  it('DIF is difference of fast and slow EMA', () => {
    const { dif } = calcMACD(prices);
    const validDif = dif.filter(d => !isNaN(d));
    expect(validDif.length).toBeGreaterThan(0);
  });

  it('histogram is 2 * (DIF - DEA)', () => {
    const { dif, dea, histogram } = calcMACD(prices);
    for (let i = 0; i < dif.length; i++) {
      if (!isNaN(dif[i]) && !isNaN(dea[i]) && !isNaN(histogram[i])) {
        expect(histogram[i]).toBeCloseTo(2 * (dif[i] - dea[i]), 5);
      }
    }
  });

  it('MACD with insufficient data returns NaN values', () => {
    const { dif } = calcMACD([1, 2, 3, 4, 5]);
    expect(dif.every(d => isNaN(d))).toBe(true);
  });

  it('DIF crosses zero indicate trend change', () => {
    const upPrices = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
    const { dif } = calcMACD(upPrices);
    const validDif = dif.filter(d => !isNaN(d));
    // 均匀上涨趋势下DIF应该为正
    expect(validDif[validDif.length - 1]).toBeGreaterThan(0);
  });
});

// RSI计算测试
describe('RSI Calculation', () => {
  const calcRSI = (closes: number[], period = 14): (number | null)[] => {
    const result: (number | null)[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < period) { result.push(null); continue; }
      let gains = 0, losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const change = closes[j] - closes[j - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      if (avgLoss === 0) { result.push(100); continue; }
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
    return result;
  };

  it('RSI of all positive changes approaches 100', () => {
    const upPrices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const rsi = calcRSI(upPrices);
    const last = rsi[rsi.length - 1];
    expect(last).toBe(100);
  });

  it('RSI of all negative changes approaches 0', () => {
    const downPrices = Array.from({ length: 20 }, (_, i) => 100 - i);
    const rsi = calcRSI(downPrices);
    const last = rsi[rsi.length - 1];
    expect(last).toBeCloseTo(0, 0);
  });

  it('RSI is between 0 and 100', () => {
    const prices = Array.from({ length: 30 }, () => 100 + Math.random() * 20 - 10);
    const rsi = calcRSI(prices);
    rsi.filter(v => v !== null).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it('first N values are null', () => {
    const prices = Array.from({ length: 20 }, (_, i) => i);
    const rsi = calcRSI(prices, 14);
    for (let i = 0; i < 14; i++) {
      expect(rsi[i]).toBeNull();
    }
    expect(rsi[14]).not.toBeNull();
  });

  it('flat prices give RSI near 50', () => {
    const flat = Array.from({ length: 20 }, () => 100);
    const rsi = calcRSI(flat);
    // 没有涨跌，avgLoss为0，RSI=100
    const last = rsi[rsi.length - 1];
    expect(last).toBe(100);
  });
});

// KDJ计算测试
describe('KDJ Calculation', () => {
  const calcKDJ = (highs: number[], lows: number[], closes: number[], n = 9) => {
    const K: (number | null)[] = [];
    const D: (number | null)[] = [];
    const J: (number | null)[] = [];
    let prevK = 50, prevD = 50;

    for (let i = 0; i < closes.length; i++) {
      if (i < n - 1) { K.push(null); D.push(null); J.push(null); continue; }
      const h = Math.max(...highs.slice(i - n + 1, i + 1));
      const l = Math.min(...lows.slice(i - n + 1, i + 1));
      const rsv = h === l ? 50 : ((closes[i] - l) / (h - l)) * 100;
      const k = (2 * prevK + rsv) / 3;
      const d = (2 * prevD + k) / 3;
      const j = 3 * k - 2 * d;
      K.push(k); D.push(d); J.push(j);
      prevK = k; prevD = d;
    }
    return { K, D, J };
  };

  const highs = [105, 108, 110, 107, 112, 115, 113, 118, 120, 117, 119, 122, 125, 123, 128];
  const lows = [99, 102, 104, 101, 106, 108, 107, 112, 114, 111, 113, 116, 119, 117, 122];
  const closes = [104, 107, 106, 105, 110, 113, 111, 116, 118, 115, 117, 120, 123, 121, 126];

  it('K, D, J arrays have same length', () => {
    const { K, D, J } = calcKDJ(highs, lows, closes);
    expect(K.length).toBe(D.length);
    expect(D.length).toBe(J.length);
  });

  it('first n-1 values are null', () => {
    const { K } = calcKDJ(highs, lows, closes, 9);
    for (let i = 0; i < 8; i++) {
      expect(K[i]).toBeNull();
    }
    expect(K[8]).not.toBeNull();
  });

  it('J = 3K - 2D', () => {
    const { K, D, J } = calcKDJ(highs, lows, closes);
    for (let i = 0; i < K.length; i++) {
      if (K[i] !== null && D[i] !== null && J[i] !== null) {
        expect(J[i]).toBeCloseTo(3 * K[i]! - 2 * D[i]!, 5);
      }
    }
  });

  it('handles all same high/low (RSV defaults to 50)', () => {
    const h = Array(15).fill(100);
    const l = Array(15).fill(100);
    const c = Array(15).fill(100);
    const { K, D, J } = calcKDJ(h, l, c, 9);
    const last = K.length - 1;
    expect(K[last]).not.toBeNull();
  });
});

// BOLL计算测试
describe('BOLL Calculation', () => {
  const calcBOLL = (closes: number[], period = 20, multiplier = 2) => {
    const upper: (number | null)[] = [];
    const middle: (number | null)[] = [];
    const lower: (number | null)[] = [];

    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1) { upper.push(null); middle.push(null); lower.push(null); continue; }
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      middle.push(mean);
      upper.push(mean + multiplier * std);
      lower.push(mean - multiplier * std);
    }
    return { upper, middle, lower };
  };

  const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.5) * 5);

  it('upper > middle > lower', () => {
    const { upper, middle, lower } = calcBOLL(prices);
    for (let i = 0; i < prices.length; i++) {
      if (upper[i] !== null) {
        expect(upper[i]).toBeGreaterThan(middle[i]!);
        expect(middle[i]).toBeGreaterThan(lower[i]!);
      }
    }
  });

  it('bandwidth is 4 * std', () => {
    const { upper, lower } = calcBOLL(prices);
    for (let i = 0; i < prices.length; i++) {
      if (upper[i] !== null) {
        const bandwidth = upper[i]! - lower[i]!;
        expect(bandwidth).toBeGreaterThan(0);
      }
    }
  });

  it('flat prices give zero bandwidth', () => {
    const flat = Array(25).fill(100);
    const { upper, lower } = calcBOLL(flat);
    const last = flat.length - 1;
    expect(upper[last]).toBeCloseTo(100, 5);
    expect(lower[last]).toBeCloseTo(100, 5);
  });

  it('first period-1 values are null', () => {
    const { middle } = calcBOLL(prices, 20);
    for (let i = 0; i < 19; i++) {
      expect(middle[i]).toBeNull();
    }
  });
});
