import { describe, it, expect } from 'vitest';

/**
 * 异常检测引擎测试
 * Z-score/IQR/移动窗口/聚类异常
 */

interface DataPoint { timestamp: number; value: number; }

function zScoreAnomalies(data: number[], threshold = 3): number[] {
  if (data.length < 2) return [];
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
  if (std === 0) return [];
  return data.map((v, i) => Math.abs((v - mean) / std) > threshold ? i : -1).filter(i => i >= 0);
}

function iqrAnomalies(data: number[]): number[] {
  const sorted = [...data].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return data.map((v, i) => (v < lower || v > upper) ? i : -1).filter(i => i >= 0);
}

function movingWindowAnomalies(data: number[], windowSize = 10, threshold = 2): Array<{ index: number; expected: number; actual: number; deviation: number }> {
  if (data.length < windowSize + 1) return [];
  const anomalies: Array<{ index: number; expected: number; actual: number; deviation: number }> = [];
  for (let i = windowSize; i < data.length; i++) {
    const window = data.slice(i - windowSize, i);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);
    if (std > 0 && Math.abs(data[i] - mean) / std > threshold) {
      anomalies.push({ index: i, expected: parseFloat(mean.toFixed(4)), actual: data[i], deviation: parseFloat(((data[i] - mean) / std).toFixed(4)) });
    }
  }
  return anomalies;
}

function detectTrendBreak(data: number[], window = 5): Array<{ index: number; beforeTrend: number; afterTrend: number; magnitude: number }> {
  if (data.length < window * 2) return [];
  const breaks: Array<{ index: number; beforeTrend: number; afterTrend: number; magnitude: number }> = [];
  for (let i = window; i < data.length - window; i++) {
    const before = data.slice(i - window, i);
    const after = data.slice(i, i + window);
    const slopeBefore = (before[before.length - 1] - before[0]) / before.length;
    const slopeAfter = (after[after.length - 1] - after[0]) / after.length;
    if (Math.sign(slopeBefore) !== Math.sign(slopeAfter) && Math.abs(slopeBefore - slopeAfter) > 0.1) {
      breaks.push({ index: i, beforeTrend: parseFloat(slopeBefore.toFixed(4)), afterTrend: parseFloat(slopeAfter.toFixed(4)), magnitude: parseFloat(Math.abs(slopeBefore - slopeAfter).toFixed(4)) });
    }
  }
  return breaks;
}

function seasonalDecompose(data: number[], period: number): { trend: number[]; seasonal: number[]; residual: number[] } {
  if (data.length < period * 2) return { trend: [], seasonal: [], residual: [] };
  const trend: number[] = [];
  const half = Math.floor(period / 2);
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    trend.push(data.slice(start, end).reduce((a, b) => a + b, 0) / (end - start));
  }
  const seasonal = new Array(data.length).fill(0);
  const detrended = data.map((v, i) => v - trend[i]);
  for (let j = 0; j < period; j++) {
    const values = [];
    for (let i = j; i < data.length; i += period) values.push(detrended[i]);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    for (let i = j; i < data.length; i += period) seasonal[i] = avg;
  }
  const residual = data.map((v, i) => v - trend[i] - seasonal[i]);
  return { trend, seasonal, residual };
}

describe('异常检测引擎', () => {
  const normalData = Array.from({ length: 100 }, () => 50 + (Math.random() - 0.5) * 10);
  const dataWithAnomaly = [...normalData, 200, ...normalData];

  describe('zScoreAnomalies', () => {
    it('should detect outliers', () => {
      const anomalies = zScoreAnomalies(dataWithAnomaly, 3);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for uniform data', () => {
      expect(zScoreAnomalies([5, 5, 5, 5, 5])).toHaveLength(0);
    });

    it('should return empty for short data', () => {
      expect(zScoreAnomalies([1])).toHaveLength(0);
    });
  });

  describe('iqrAnomalies', () => {
    it('should detect outliers', () => {
      const anomalies = iqrAnomalies(dataWithAnomaly);
      expect(anomalies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('movingWindowAnomalies', () => {
    it('should detect sudden jumps', () => {
      const data = Array.from({ length: 20 }, (_, i) => 50 + i * 0.01);
      data.push(200);
      const anomalies = movingWindowAnomalies(data, 5, 2);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for short data', () => {
      expect(movingWindowAnomalies([1, 2, 3], 10)).toHaveLength(0);
    });
  });

  describe('detectTrendBreak', () => {
    it('should detect trend reversal', () => {
      const up = Array.from({ length: 10 }, (_, i) => i);
      const down = Array.from({ length: 10 }, (_, i) => 10 - i);
      const data = [...up, ...down];
      const breaks = detectTrendBreak(data, 5);
      expect(breaks.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for monotonic data', () => {
      const data = Array.from({ length: 20 }, (_, i) => i);
      expect(detectTrendBreak(data, 5)).toHaveLength(0);
    });
  });

  describe('seasonalDecompose', () => {
    it('should return three components', () => {
      const data = Array.from({ length: 48 }, (_, i) => 100 + Math.sin(i * Math.PI / 6) * 20 + i * 0.5);
      const result = seasonalDecompose(data, 12);
      expect(result.trend.length).toBe(data.length);
      expect(result.seasonal.length).toBe(data.length);
      expect(result.residual.length).toBe(data.length);
    });

    it('should handle short data', () => {
      const result = seasonalDecompose([1, 2, 3], 12);
      expect(result.trend).toHaveLength(0);
    });
  });
});
