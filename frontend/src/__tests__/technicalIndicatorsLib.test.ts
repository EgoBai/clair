import { describe, it, expect } from 'vitest';

// 技术指标计算库
describe('技术指标计算库', () => {
  // RSI
  function rsi(prices: number[], period: number = 14): number[] {
    if (prices.length < period + 1) return [];
    const result: number[] = [];
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = prices[i]! - prices[i - 1]!;
      if (diff > 0) gain += diff; else loss -= diff;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i]! - prices[i - 1]!;
      const g = diff > 0 ? diff : 0;
      const l = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return result;
  }

  // MACD
  function ema(prices: number[], period: number): number[] {
    if (prices.length === 0) return [];
    const k = 2 / (period + 1);
    const result = [prices[0]!];
    for (let i = 1; i < prices.length; i++) {
      result.push(prices[i]! * k + result[i - 1]! * (1 - k));
    }
    return result;
  }

  function macd(prices: number[], fast: number = 12, slow: number = 26, signal: number = 9) {
    const emaFast = ema(prices, fast);
    const emaSlow = ema(prices, slow);
    const dif = emaFast.map((v, i) => v - (emaSlow[i] ?? 0));
    const dea = ema(dif.slice(slow - 1), signal);
    const histogram = dif.slice(slow - 1).map((v, i) => (v - (dea[i] ?? 0)) * 2);
    return { dif: dif.slice(slow - 1), dea, histogram };
  }

  // Bollinger Bands
  function bollingerBands(prices: number[], period: number = 20, multiplier: number = 2) {
    const result: { upper: number; middle: number; lower: number }[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = slice.reduce((s, v) => s + v, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      result.push({ upper: mean + multiplier * std, middle: mean, lower: mean - multiplier * std });
    }
    return result;
  }

  // Stochastic
  function stochastic(highs: number[], lows: number[], closes: number[], kPeriod: number = 14, dPeriod: number = 3) {
    const k: number[] = [];
    for (let i = kPeriod - 1; i < closes.length; i++) {
      const h = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
      const l = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
      k.push(h > l ? ((closes[i]! - l) / (h - l)) * 100 : 50);
    }
    const d: number[] = [];
    for (let i = dPeriod - 1; i < k.length; i++) {
      d.push(k.slice(i - dPeriod + 1, i + 1).reduce((s, v) => s + v, 0) / dPeriod);
    }
    return { k, d };
  }

  // ATR
  function atr(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
    if (highs.length < 2) return [];
    const tr: number[] = [];
    for (let i = 1; i < highs.length; i++) {
      tr.push(Math.max(highs[i]! - lows[i]!, Math.abs(highs[i]! - closes[i - 1]!), Math.abs(lows[i]! - closes[i - 1]!)));
    }
    const result: number[] = [tr.slice(0, period).reduce((s, v) => s + v, 0) / period];
    for (let i = period; i < tr.length; i++) {
      result.push((result[result.length - 1]! * (period - 1) + tr[i]!) / period);
    }
    return result;
  }

  // OBV
  function obv(closes: number[], volumes: number[]): number[] {
    if (closes.length === 0) return [];
    const result = [volumes[0]!];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i]! > closes[i - 1]!) result.push(result[i - 1]! + volumes[i]!);
      else if (closes[i]! < closes[i - 1]!) result.push(result[i - 1]! - volumes[i]!);
      else result.push(result[i - 1]!);
    }
    return result;
  }

  it('RSI应返回0-100范围', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = rsi(prices, 14);
    expect(result.every(v => v >= 0 && v <= 100)).toBe(true);
  });

  it('持续上涨RSI应接近100', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = rsi(prices, 14);
    expect(result[result.length - 1]).toBeGreaterThan(80);
  });

  it('持续下跌RSI应接近0', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 200 - i);
    const result = rsi(prices, 14);
    expect(result[result.length - 1]).toBeLessThan(20);
  });

  it('数据不足RSI应返回空', () => {
    expect(rsi([1, 2, 3], 14)).toHaveLength(0);
  });

  it('EMA应正确计算', () => {
    const result = ema([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe(1);
  });

  it('MACD应返回DIF/DEA/柱状图', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 10);
    const result = macd(prices);
    expect(result.dif.length).toBeGreaterThan(0);
    expect(result.dea.length).toBeGreaterThan(0);
    expect(result.histogram.length).toBeGreaterThan(0);
  });

  it('布林带应包含上中下轨', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 5) * 5);
    const bands = bollingerBands(prices, 20, 2);
    expect(bands[0]!.upper).toBeGreaterThan(bands[0]!.middle);
    expect(bands[0]!.middle).toBeGreaterThan(bands[0]!.lower);
  });

  it('数据不足布林带应返回空', () => {
    expect(bollingerBands([1, 2, 3], 20)).toHaveLength(0);
  });

  it('随机指标应在0-100', () => {
    const highs = Array.from({ length: 20 }, (_, i) => 110 + i);
    const lows = Array.from({ length: 20 }, (_, i) => 90 + i);
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = stochastic(highs, lows, closes);
    expect(result.k.every(v => v >= 0 && v <= 100)).toBe(true);
  });

  it('ATR应为正数', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 110 + i);
    const lows = Array.from({ length: n }, (_, i) => 90 + i);
    const closes = Array.from({ length: n }, (_, i) => 100 + i);
    const result = atr(highs, lows, closes, 14);
    expect(result.every(v => v > 0)).toBe(true);
  });

  it('数据不足ATR应返回空', () => {
    expect(atr([1], [0], [0.5], 14)).toHaveLength(0);
  });

  it('OBV应正确累积', () => {
    const closes = [10, 11, 12, 11, 10];
    const volumes = [100, 200, 150, 300, 100];
    const result = obv(closes, volumes);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(300);
    expect(result[3]).toBe(150);
  });

  it('空数据OBV应返回空', () => {
    expect(obv([], [])).toHaveLength(0);
  });

  it('大量数据技术指标应正确', () => {
    const n = 500;
    const prices = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 10) * 20);
    const rsiResult = rsi(prices, 14);
    expect(rsiResult.length).toBe(n - 14);
    const bb = bollingerBands(prices, 20, 2);
    expect(bb.length).toBe(n - 19);
  });
});

// 数据清洗引擎
describe('数据清洗引擎', () => {
  function removeDuplicates<T>(data: T[], key: keyof T): T[] {
    const seen = new Set<unknown>();
    return data.filter(item => {
      const k = item[key];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function fillMissingValues(data: (number | null)[], method: 'mean' | 'median' | 'zero'): number[] {
    const valid = data.filter((v): v is number => v !== null);
    if (valid.length === 0) return data.map(() => 0);
    let fillValue: number;
    if (method === 'mean') fillValue = valid.reduce((s, v) => s + v, 0) / valid.length;
    else if (method === 'median') {
      const sorted = [...valid].sort((a, b) => a - b);
      fillValue = sorted[Math.floor(sorted.length / 2)]!;
    }
    else fillValue = 0;
    return data.map(v => v ?? fillValue);
  }

  function normalize(data: number[]): number[] {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    return range === 0 ? data.map(() => 0) : data.map(v => (v - min) / range);
  }

  function zScore(data: number[]): number[] {
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
    return std === 0 ? data.map(() => 0) : data.map(v => (v - mean) / std);
  }

  function smooth(data: number[], window: number): number[] {
    return data.map((_, i) => {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(data.length, i + Math.ceil(window / 2));
      const slice = data.slice(start, end);
      return slice.reduce((s, v) => s + v, 0) / slice.length;
    });
  }

  it('应去重', () => {
    const data = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 1, v: 'c' }];
    expect(removeDuplicates(data, 'id')).toHaveLength(2);
  });

  it('无重复应返回全部', () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(removeDuplicates(data, 'id')).toHaveLength(3);
  });

  it('应均值填充缺失值', () => {
    const data = [1, null, 3, null, 5];
    const filled = fillMissingValues(data, 'mean');
    expect(filled).toEqual([1, 3, 3, 3, 5]);
  });

  it('应中位数填充缺失值', () => {
    const data = [1, null, 100];
    const filled = fillMissingValues(data, 'median');
    expect(filled[1]).toBe(100);
  });

  it('应零值填充', () => {
    const data = [1, null, 3];
    expect(fillMissingValues(data, 'zero')).toEqual([1, 0, 3]);
  });

  it('全空应零值填充', () => {
    expect(fillMissingValues([null, null], 'mean')).toEqual([0, 0]);
  });

  it('应归一化到0-1', () => {
    const data = [10, 20, 30, 40, 50];
    const normed = normalize(data);
    expect(normed[0]).toBe(0);
    expect(normed[4]).toBe(1);
  });

  it('恒定数据归一化应为0', () => {
    expect(normalize([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('Z-Score均值应接近0', () => {
    const data = [1, 2, 3, 4, 5];
    const scores = zScore(data);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    expect(Math.abs(mean)).toBeLessThan(0.001);
  });

  it('恒定数据Z-Score应为0', () => {
    expect(zScore([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('应平滑数据', () => {
    const data = [1, 100, 1, 100, 1];
    const smoothed = smooth(data, 3);
    expect(smoothed[1]).toBeLessThan(100);
    expect(smoothed[1]).toBeGreaterThan(1);
  });

  it('大量数据去重应正确', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ id: i % 100, v: i }));
    expect(removeDuplicates(data, 'id')).toHaveLength(100);
  });
});

// 时间序列分析
describe('时间序列分析引擎', () => {
  interface TimePoint { timestamp: number; value: number }

  function linearInterpolate(series: TimePoint[], targetTime: number): number {
    if (series.length === 0) return 0;
    const sorted = [...series].sort((a, b) => a.timestamp - b.timestamp);
    if (targetTime <= sorted[0]!.timestamp) return sorted[0]!.value;
    if (targetTime >= sorted[sorted.length - 1]!.timestamp) return sorted[sorted.length - 1]!.value;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (targetTime >= sorted[i]!.timestamp && targetTime <= sorted[i + 1]!.timestamp) {
        const ratio = (targetTime - sorted[i]!.timestamp) / (sorted[i + 1]!.timestamp - sorted[i]!.timestamp);
        return sorted[i]!.value + ratio * (sorted[i + 1]!.value - sorted[i]!.value);
      }
    }
    return 0;
  }

  function movingAverage(series: TimePoint[], period: number): TimePoint[] {
    const result: TimePoint[] = [];
    for (let i = period - 1; i < series.length; i++) {
      const slice = series.slice(i - period + 1, i + 1);
      const avg = slice.reduce((s, p) => s + p.value, 0) / period;
      result.push({ timestamp: series[i]!.timestamp, value: avg });
    }
    return result;
  }

  function exponentialSmoothing(series: TimePoint[], alpha: number): TimePoint[] {
    if (series.length === 0) return [];
    const result: TimePoint[] = [{ timestamp: series[0]!.timestamp, value: series[0]!.value }];
    for (let i = 1; i < series.length; i++) {
      result.push({
        timestamp: series[i]!.timestamp,
        value: alpha * series[i]!.value + (1 - alpha) * result[i - 1]!.value,
      });
    }
    return result;
  }

  function detectTrend(series: TimePoint[]): 'up' | 'down' | 'flat' {
    if (series.length < 2) return 'flat';
    const first = series[0]!.value;
    const last = series[series.length - 1]!.value;
    const threshold = Math.abs(first) * 0.05;
    return last - first > threshold ? 'up' : first - last > threshold ? 'down' : 'flat';
  }

  it('应线性插值', () => {
    const series: TimePoint[] = [
      { timestamp: 0, value: 0 },
      { timestamp: 10, value: 100 },
    ];
    expect(linearInterpolate(series, 5)).toBe(50);
  });

  it('超出范围应返回边界值', () => {
    const series: TimePoint[] = [{ timestamp: 5, value: 50 }, { timestamp: 10, value: 100 }];
    expect(linearInterpolate(series, 0)).toBe(50);
    expect(linearInterpolate(series, 15)).toBe(100);
  });

  it('空序列插值应为0', () => {
    expect(linearInterpolate([], 5)).toBe(0);
  });

  it('应计算移动平均', () => {
    const series: TimePoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: i + 1 }));
    const ma = movingAverage(series, 3);
    expect(ma).toHaveLength(8);
    expect(ma[0]!.value).toBe(2);
  });

  it('应指数平滑', () => {
    const series: TimePoint[] = [{ timestamp: 0, value: 100 }, { timestamp: 1, value: 110 }];
    const smoothed = exponentialSmoothing(series, 0.5);
    expect(smoothed[1]!.value).toBe(105);
  });

  it('空序列平滑应返回空', () => {
    expect(exponentialSmoothing([], 0.5)).toHaveLength(0);
  });

  it('应检测上升趋势', () => {
    const series: TimePoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 100 + i * 10 }));
    expect(detectTrend(series)).toBe('up');
  });

  it('应检测下降趋势', () => {
    const series: TimePoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 200 - i * 10 }));
    expect(detectTrend(series)).toBe('down');
  });

  it('单点趋势应为flat', () => {
    expect(detectTrend([{ timestamp: 0, value: 100 }])).toBe('flat');
  });

  it('大量数据移动平均应正确', () => {
    const series: TimePoint[] = Array.from({ length: 1000 }, (_, i) => ({ timestamp: i, value: 100 }));
    const ma = movingAverage(series, 20);
    expect(ma.every(p => p.value === 100)).toBe(true);
    expect(ma).toHaveLength(981);
  });

  it('精确匹配插值应返回原值', () => {
    const series: TimePoint[] = [{ timestamp: 5, value: 42 }, { timestamp: 10, value: 84 }];
    expect(linearInterpolate(series, 5)).toBe(42);
    expect(linearInterpolate(series, 10)).toBe(84);
  });
});
