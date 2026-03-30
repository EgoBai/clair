import { describe, it, expect } from 'vitest';

// Time series analysis utilities
interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

function calculateTrend(points: TimeSeriesPoint[]): 'up' | 'down' | 'sideways' {
  if (points.length < 2) return 'sideways';
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const change = (last - first) / first;
  if (change > 0.02) return 'up';
  if (change < -0.02) return 'down';
  return 'sideways';
}

function calculateSeasonality(points: TimeSeriesPoint[], period: number): number[] {
  if (points.length < period) return [];
  const seasonal: number[] = Array(period).fill(0);
  const counts: number[] = Array(period).fill(0);
  for (let i = 0; i < points.length; i++) {
    const idx = i % period;
    seasonal[idx] += points[i].value;
    counts[idx]++;
  }
  return seasonal.map((s, i) => counts[i] === 0 ? 0 : s / counts[i]);
}

function calculateLinearRegression(points: TimeSeriesPoint[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const sumX = points.reduce((s, p) => s + p.timestamp, 0);
  const sumY = points.reduce((s, p) => s + p.value, 0);
  const sumXY = points.reduce((s, p) => s + p.timestamp * p.value, 0);
  const sumX2 = points.reduce((s, p) => s + p.timestamp ** 2, 0);
  const sumY2 = points.reduce((s, p) => s + p.value ** 2, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2);
  const intercept = (sumY - slope * sumX) / n;
  const yMean = sumY / n;
  const ssTotal = points.reduce((s, p) => s + (p.value - yMean) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.value - (slope * p.timestamp + intercept)) ** 2, 0);
  const r2 = ssTotal === 0 ? 0 : 1 - ssRes / ssTotal;
  return { slope, intercept, r2 };
}

function detectAnomalies(points: TimeSeriesPoint[], windowSize: number, threshold: number = 2): number[] {
  if (points.length < windowSize) return [];
  const anomalies: number[] = [];
  for (let i = windowSize; i < points.length; i++) {
    const window = points.slice(i - windowSize, i);
    const mean = window.reduce((s, p) => s + p.value, 0) / windowSize;
    const std = Math.sqrt(window.reduce((s, p) => s + (p.value - mean) ** 2, 0) / windowSize);
    if (std > 0 && Math.abs(points[i].value - mean) / std > threshold) {
      anomalies.push(i);
    }
  }
  return anomalies;
}

function calculateAutoCorrelation(points: TimeSeriesPoint[], lag: number): number {
  if (points.length < lag + 2) return 0;
  const values = points.map(p => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let num = 0, den = 0;
  for (let i = 0; i < values.length - lag; i++) {
    num += (values[i] - mean) * (values[i + lag] - mean);
  }
  for (let i = 0; i < values.length; i++) {
    den += (values[i] - mean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function forecastLinear(points: TimeSeriesPoint[], periods: number): number[] {
  const { slope, intercept } = calculateLinearRegression(points);
  const lastTimestamp = points[points.length - 1].timestamp;
  const forecasts: number[] = [];
  for (let i = 1; i <= periods; i++) {
    forecasts.push(slope * (lastTimestamp + i) + intercept);
  }
  return forecasts;
}

function exponentialSmoothing(points: TimeSeriesPoint[], alpha: number): number[] {
  if (points.length === 0) return [];
  const result: number[] = [points[0].value];
  for (let i = 1; i < points.length; i++) {
    result.push(alpha * points[i].value + (1 - alpha) * result[i - 1]);
  }
  return result;
}

describe('时间序列分析', () => {
  const upTrend: TimeSeriesPoint[] = Array.from({ length: 20 }, (_, i) => ({ timestamp: i, value: 100 + i * 2 }));
  const downTrend: TimeSeriesPoint[] = Array.from({ length: 20 }, (_, i) => ({ timestamp: i, value: 200 - i * 2 }));
  const sideways: TimeSeriesPoint[] = Array.from({ length: 20 }, (_, i) => ({ timestamp: i, value: 100 + (i % 2 === 0 ? 1 : -1) }));

  describe('趋势检测', () => {
    it('应该识别上涨趋势', () => {
      expect(calculateTrend(upTrend)).toBe('up');
    });

    it('应该识别下跌趋势', () => {
      expect(calculateTrend(downTrend)).toBe('down');
    });

    it('应该识别震荡', () => {
      expect(calculateTrend(sideways)).toBe('sideways');
    });

    it('单一数据点应该返回sideways', () => {
      expect(calculateTrend([{ timestamp: 0, value: 100 }])).toBe('sideways');
    });

    it('空数据应该返回sideways', () => {
      expect(calculateTrend([])).toBe('sideways');
    });
  });

  describe('季节性分析', () => {
    it('应该计算季节性因子', () => {
      const seasonal = calculateSeasonality(upTrend, 5);
      expect(seasonal.length).toBe(5);
    });

    it('数据不足应该返回空', () => {
      expect(calculateSeasonality([{ timestamp: 0, value: 1 }], 10)).toEqual([]);
    });

    it('恒定数据季节性应该都等于该值', () => {
      const flat: TimeSeriesPoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 50 }));
      const seasonal = calculateSeasonality(flat, 5);
      expect(seasonal.every(s => s === 50)).toBe(true);
    });
  });

  describe('线性回归', () => {
    it('应该计算斜率和截距', () => {
      const { slope, intercept, r2 } = calculateLinearRegression(upTrend);
      expect(slope).toBeGreaterThan(0);
      expect(r2).toBeGreaterThan(0.9);
    });

    it('完美线性数据R2应该为1', () => {
      const linear: TimeSeriesPoint[] = [
        { timestamp: 0, value: 0 },
        { timestamp: 1, value: 1 },
        { timestamp: 2, value: 2 },
        { timestamp: 3, value: 3 },
      ];
      const { r2 } = calculateLinearRegression(linear);
      expect(r2).toBeCloseTo(1);
    });

    it('平坦数据斜率应该为0', () => {
      const flat: TimeSeriesPoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 100 }));
      const { slope } = calculateLinearRegression(flat);
      expect(slope).toBeCloseTo(0);
    });

    it('单一数据点应该返回零斜率', () => {
      const { slope, intercept } = calculateLinearRegression([{ timestamp: 0, value: 100 }]);
      expect(slope).toBe(0);
      expect(intercept).toBe(0);
    });
  });

  describe('异常值检测', () => {
    it('应该检测异常值', () => {
      const data = [...upTrend];
      data[10] = { timestamp: 10, value: 9999 };
      const anomalies = detectAnomalies(data, 5, 2);
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('无异常值应该返回空', () => {
      const flat: TimeSeriesPoint[] = Array.from({ length: 20 }, (_, i) => ({ timestamp: i, value: 100 }));
      const anomalies = detectAnomalies(flat, 5, 2);
      expect(anomalies.length).toBe(0);
    });

    it('数据不足应该返回空', () => {
      expect(detectAnomalies([{ timestamp: 0, value: 1 }], 5)).toEqual([]);
    });
  });

  describe('自相关', () => {
    it('应该计算自相关', () => {
      const ac = calculateAutoCorrelation(upTrend, 1);
      expect(typeof ac).toBe('number');
    });

    it('周期数据应该在周期倍数处有高自相关', () => {
      const periodic: TimeSeriesPoint[] = Array.from({ length: 30 }, (_, i) => ({
        timestamp: i, value: Math.sin(i * Math.PI / 5) * 10 + 100
      }));
      const ac5 = calculateAutoCorrelation(periodic, 5);
      expect(Math.abs(ac5)).toBeGreaterThan(0.3);
    });

    it('lag大于数据长度应该返回0', () => {
      expect(calculateAutoCorrelation(upTrend, 100)).toBe(0);
    });
  });

  describe('线性预测', () => {
    it('应该预测未来值', () => {
      const forecasts = forecastLinear(upTrend, 5);
      expect(forecasts.length).toBe(5);
      expect(forecasts[0]).toBeGreaterThan(upTrend[upTrend.length - 1].value);
    });

    it('下跌趋势预测应该继续下跌', () => {
      const forecasts = forecastLinear(downTrend, 3);
      expect(forecasts[0]).toBeLessThan(downTrend[downTrend.length - 1].value);
    });
  });

  describe('指数平滑', () => {
    it('应该平滑数据', () => {
      const smoothed = exponentialSmoothing(upTrend, 0.3);
      expect(smoothed.length).toBe(upTrend.length);
      expect(smoothed[0]).toBe(upTrend[0].value);
    });

    it('alpha=1应该等于原数据', () => {
      const smoothed = exponentialSmoothing(upTrend, 1);
      expect(smoothed).toEqual(upTrend.map(p => p.value));
    });

    it('alpha=0应该全部等于首值', () => {
      const smoothed = exponentialSmoothing(upTrend, 0);
      expect(smoothed.every(s => s === upTrend[0].value)).toBe(true);
    });

    it('空数据应该返回空', () => {
      expect(exponentialSmoothing([], 0.5)).toEqual([]);
    });
  });
});
