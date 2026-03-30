import { describe, it, expect } from 'vitest';

// Market Data Transformation Utilities
interface RawKLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

interface ProcessedKLine extends RawKLine {
  change: number;
  changePercent: number;
  amplitude: number;
  isUp: boolean;
  isDown: boolean;
  isDoji: boolean;
  bodySize: number;
  upperShadow: number;
  lowerShadow: number;
  avgPrice: number;
}

function processKLine(raw: RawKLine, prevClose?: number): ProcessedKLine {
  const reference = prevClose ?? raw.open;
  const change = raw.close - reference;
  const changePercent = reference !== 0 ? (change / reference) * 100 : 0;
  const amplitude = raw.low !== 0 ? ((raw.high - raw.low) / raw.low) * 100 : 0;
  const bodyTop = Math.max(raw.open, raw.close);
  const bodyBottom = Math.min(raw.open, raw.close);
  const avgPrice = raw.volume !== 0 ? raw.turnover / raw.volume : 0;

  return {
    ...raw,
    change: Number(change.toFixed(2)),
    changePercent: Number(changePercent.toFixed(2)),
    amplitude: Number(amplitude.toFixed(2)),
    isUp: raw.close > raw.open,
    isDown: raw.close < raw.open,
    isDoji: raw.close === raw.open,
    bodySize: Number((bodyTop - bodyBottom).toFixed(2)),
    upperShadow: Number((raw.high - bodyTop).toFixed(2)),
    lowerShadow: Number((bodyBottom - raw.low).toFixed(2)),
    avgPrice: Number(avgPrice.toFixed(2)),
  };
}

function processKLineSeries(raws: RawKLine[]): ProcessedKLine[] {
  return raws.map((raw, i) => {
    const prevClose = i > 0 ? raws[i - 1].close : undefined;
    return processKLine(raw, prevClose);
  });
}

function calculatePeriodReturns(prices: number[]): { daily: number[]; cumulative: number[] } {
  const daily = prices.map((p, i) => i === 0 ? 0 : ((p - prices[i - 1]) / prices[i - 1]) * 100);
  const cumulative = prices.map((p) => ((p - prices[0]) / prices[0]) * 100);
  return {
    daily: daily.map(d => Number(d.toFixed(4))),
    cumulative: cumulative.map(c => Number(c.toFixed(4))),
  };
}

function calculateVolatility(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const result: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, p) => s + p, 0) / period;
    const variance = slice.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / period;
    result.push(Number(Math.sqrt(variance).toFixed(4)));
  }
  return result;
}

function normalizeToRange(values: number[], min: number, max: number): number[] {
  if (values.length === 0) return [];
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const range = dataMax - dataMin;
  if (range === 0) return values.map(() => (min + max) / 2);
  return values.map(v => Number(((v - dataMin) / range * (max - min) + min).toFixed(4)));
}

function calculateZScore(values: number[]): number[] {
  if (values.length === 0) return [];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return values.map(() => 0);
  return values.map(v => Number(((v - mean) / stdDev).toFixed(4)));
}

function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const n = x.length;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }
  const denom = Math.sqrt(sumX2 * sumY2);
  return denom === 0 ? 0 : Number((sumXY / denom).toFixed(4));
}

function resampleOHLC(data: RawKLine[], intervalDays: number): RawKLine[] {
  if (data.length === 0 || intervalDays < 1) return [];
  const result: RawKLine[] = [];
  for (let i = 0; i < data.length; i += intervalDays) {
    const chunk = data.slice(i, i + intervalDays);
    result.push({
      date: chunk[0].date,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
      turnover: chunk.reduce((s, c) => s + c.turnover, 0),
    });
  }
  return result;
}

describe('Market Data Transformation', () => {
  const sampleKLine: RawKLine = {
    date: '2024-01-15',
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1000000,
    turnover: 102500000,
  };

  describe('processKLine', () => {
    it('should calculate change from open', () => {
      const processed = processKLine(sampleKLine);
      expect(processed.change).toBe(5);
      expect(processed.changePercent).toBe(5);
    });

    it('should calculate change from prevClose', () => {
      const processed = processKLine(sampleKLine, 98);
      expect(processed.change).toBe(7);
    });

    it('should detect up candle', () => {
      expect(processKLine(sampleKLine).isUp).toBe(true);
      expect(processKLine(sampleKLine).isDown).toBe(false);
    });

    it('should detect down candle', () => {
      const down = { ...sampleKLine, open: 105, close: 95 };
      expect(processKLine(down).isDown).toBe(true);
    });

    it('should detect doji', () => {
      const doji = { ...sampleKLine, open: 100, close: 100 };
      expect(processKLine(doji).isDoji).toBe(true);
    });

    it('should calculate body size', () => {
      const processed = processKLine(sampleKLine);
      expect(processed.bodySize).toBe(5); // 105 - 100
    });

    it('should calculate shadows', () => {
      const processed = processKLine(sampleKLine);
      expect(processed.upperShadow).toBe(5);  // 110 - 105
      expect(processed.lowerShadow).toBe(5);  // 100 - 95 (open > close min is open)
    });

    it('should calculate average price', () => {
      const processed = processKLine(sampleKLine);
      expect(processed.avgPrice).toBeCloseTo(102.5, 1);
    });

    it('should handle zero prevClose', () => {
      const processed = processKLine(sampleKLine, 0);
      expect(processed.changePercent).toBe(0);
    });

    it('should handle zero volume', () => {
      const processed = processKLine({ ...sampleKLine, volume: 0, turnover: 0 });
      expect(processed.avgPrice).toBe(0);
    });
  });

  describe('processKLineSeries', () => {
    it('should process series with prev close reference', () => {
      const series: RawKLine[] = [
        { date: '2024-01-01', open: 100, high: 105, low: 95, close: 102, volume: 1000, turnover: 100000 },
        { date: '2024-01-02', open: 102, high: 110, low: 100, close: 108, volume: 1000, turnover: 100000 },
      ];
      const processed = processKLineSeries(series);
      expect(processed[1].change).toBe(6); // 108 - 102 (prev close)
    });

    it('should handle single item', () => {
      const processed = processKLineSeries([sampleKLine]);
      expect(processed).toHaveLength(1);
    });
  });

  describe('calculatePeriodReturns', () => {
    it('should calculate daily returns', () => {
      const { daily } = calculatePeriodReturns([100, 110, 105]);
      expect(daily[0]).toBe(0);
      expect(daily[1]).toBeCloseTo(10, 0);
      expect(daily[2]).toBeCloseTo(-4.54, 0);
    });

    it('should calculate cumulative returns', () => {
      const { cumulative } = calculatePeriodReturns([100, 110, 120]);
      expect(cumulative[0]).toBe(0);
      expect(cumulative[1]).toBe(10);
      expect(cumulative[2]).toBe(20);
    });

    it('should handle single price', () => {
      const { daily, cumulative } = calculatePeriodReturns([100]);
      expect(daily).toEqual([0]);
      expect(cumulative).toEqual([0]);
    });
  });

  describe('calculateVolatility', () => {
    it('should calculate volatility for rolling window', () => {
      const vol = calculateVolatility([1, 2, 3, 4, 5], 3);
      expect(vol.length).toBe(3);
    });

    it('should return empty for insufficient data', () => {
      expect(calculateVolatility([1, 2], 5)).toEqual([]);
    });

    it('should return 0 for constant values', () => {
      const vol = calculateVolatility([5, 5, 5, 5, 5], 3);
      expect(vol.every(v => v === 0)).toBe(true);
    });
  });

  describe('normalizeToRange', () => {
    it('should normalize to 0-1 range', () => {
      const result = normalizeToRange([10, 20, 30], 0, 1);
      expect(result[0]).toBe(0);
      expect(result[2]).toBe(1);
      expect(result[1]).toBeCloseTo(0.5);
    });

    it('should handle empty array', () => {
      expect(normalizeToRange([], 0, 1)).toEqual([]);
    });

    it('should handle constant values', () => {
      const result = normalizeToRange([5, 5, 5], 0, 10);
      expect(result.every(v => v === 5)).toBe(true);
    });
  });

  describe('calculateZScore', () => {
    it('should return 0 for mean', () => {
      const scores = calculateZScore([1, 2, 3, 4, 5]);
      expect(scores[2]).toBe(0); // 3 is the mean
    });

    it('should be symmetric around mean', () => {
      const scores = calculateZScore([1, 2, 3, 4, 5]);
      expect(scores[0]).toBe(-scores[4]);
      expect(scores[1]).toBe(-scores[3]);
    });

    it('should return 0s for constant values', () => {
      expect(calculateZScore([5, 5, 5])).toEqual([0, 0, 0]);
    });

    it('should handle empty array', () => {
      expect(calculateZScore([])).toEqual([]);
    });
  });

  describe('calculateCorrelation', () => {
    it('should return 1 for identical series', () => {
      expect(calculateCorrelation([1, 2, 3], [1, 2, 3])).toBe(1);
    });

    it('should return -1 for inverse series', () => {
      expect(calculateCorrelation([1, 2, 3], [3, 2, 1])).toBe(-1);
    });

    it('should return 0 for mismatched length', () => {
      expect(calculateCorrelation([1, 2], [1])).toBe(0);
    });

    it('should return 0 for empty arrays', () => {
      expect(calculateCorrelation([], [])).toBe(0);
    });

    it('should handle constant series', () => {
      expect(calculateCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
    });
  });

  describe('resampleOHLC', () => {
    it('should aggregate to weekly', () => {
      const data: RawKLine[] = [
        { date: '2024-01-01', open: 100, high: 105, low: 95, close: 102, volume: 1000, turnover: 100000 },
        { date: '2024-01-02', open: 102, high: 110, low: 100, close: 108, volume: 2000, turnover: 200000 },
        { date: '2024-01-03', open: 108, high: 115, low: 105, close: 112, volume: 3000, turnover: 300000 },
      ];
      const weekly = resampleOHLC(data, 2);
      expect(weekly).toHaveLength(2);
      expect(weekly[0].open).toBe(100);
      expect(weekly[0].high).toBe(110);
      expect(weekly[0].low).toBe(95);
      expect(weekly[0].close).toBe(108);
      expect(weekly[0].volume).toBe(3000);
    });

    it('should handle empty data', () => {
      expect(resampleOHLC([], 5)).toEqual([]);
    });

    it('should handle interval of 1', () => {
      const data: RawKLine[] = [
        { date: '2024-01-01', open: 100, high: 105, low: 95, close: 102, volume: 1000, turnover: 100000 },
      ];
      const result = resampleOHLC(data, 1);
      expect(result).toHaveLength(1);
    });

    it('should handle interval larger than data', () => {
      const data: RawKLine[] = [
        { date: '2024-01-01', open: 100, high: 105, low: 95, close: 102, volume: 1000, turnover: 100000 },
      ];
      const result = resampleOHLC(data, 10);
      expect(result).toHaveLength(1);
    });
  });
});
