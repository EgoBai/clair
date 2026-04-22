import { describe, it, expect } from 'vitest';
import {
  seasonalDecompose,
  autoRegressive,
  detectAnomalies,
  trendForecast,
  detectChangePoints,
} from '../utils/timeSeriesEngine';

describe('时间序列分析引擎', () => {
  describe('seasonalDecompose', () => {
    it('should decompose into trend, seasonal, residual', () => {
      const series = Array.from({ length: 100 }, (_, i) =>
        100 + i * 0.5 + Math.sin(i / 5) * 10 + (Math.random() - 0.5) * 2
      );
      const result = seasonalDecompose(series, 10);

      expect(result.trend.length).toBe(100);
      expect(result.seasonal.length).toBe(100);
      expect(result.residual.length).toBe(100);
    });

    it('should compute seasonal strength', () => {
      // 强季节性数据
      const series = Array.from({ length: 100 }, (_, i) =>
        Math.sin(i / 5) * 10 + 100
      );
      const result = seasonalDecompose(series, 10);
      expect(result.seasonalStrength).toBeGreaterThan(0);
    });

    it('should handle short data', () => {
      const series = [1, 2, 3];
      const result = seasonalDecompose(series, 5);
      expect(result.trend.length).toBe(3);
    });

    it('residual should be small for smooth data', () => {
      // 完美周期数据
      const series = Array.from({ length: 50 }, (_, i) => Math.sin(i / 5) * 10);
      const result = seasonalDecompose(series, 10);
      // 残差应该接近0
      const avgResidual = result.residual.reduce((a, b) => a + Math.abs(b), 0) / result.residual.length;
      expect(avgResidual).toBeLessThan(5);
    });
  });

  describe('autoRegressive', () => {
    it('should predict future values', () => {
      const series = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5 + Math.random());
      const result = autoRegressive(series, 2, 5);

      expect(result.predictions.length).toBe(5);
      expect(result.confidenceUpper.length).toBe(5);
      expect(result.confidenceLower.length).toBe(5);
    });

    it('upper should be greater than lower', () => {
      const series = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5 + Math.random() * 2);
      const result = autoRegressive(series, 2, 5);

      for (let i = 0; i < 5; i++) {
        expect(result.confidenceUpper[i]).toBeGreaterThan(result.confidenceLower[i]);
      }
    });

    it('should handle short series', () => {
      const result = autoRegressive([100, 101], 2, 3);
      expect(result.predictions.length).toBe(3);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect spikes', () => {
      const series = Array.from({ length: 60 }, () => 100 + (Math.random() - 0.5) * 2);
      series[50] = 150; // 明显异常

      const anomalies = detectAnomalies(series, 20, 3.0);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies.some(a => a.type === 'spike')).toBe(true);
    });

    it('should detect dips', () => {
      const series = Array.from({ length: 60 }, () => 100 + (Math.random() - 0.5) * 2);
      series[50] = 50; // 明显下跌

      const anomalies = detectAnomalies(series, 20, 3.0);
      expect(anomalies.some(a => a.type === 'dip')).toBe(true);
    });

    it('should return empty for no anomalies', () => {
      const series = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i * 0.1) * 0.2);
      const anomalies = detectAnomalies(series, 20, 3.0);
      expect(anomalies.length).toBe(0);
    });

    it('should return empty for short data', () => {
      const anomalies = detectAnomalies([1, 2, 3], 20, 3.0);
      expect(anomalies.length).toBe(0);
    });

    it('z-scores should exceed threshold', () => {
      const series = Array.from({ length: 60 }, () => 100);
      series[50] = 200;
      const anomalies = detectAnomalies(series, 20, 3.0);
      for (const a of anomalies) {
        expect(Math.abs(a.zScore)).toBeGreaterThan(3.0);
      }
    });
  });

  describe('trendForecast', () => {
    it('should forecast future values', () => {
      const series = Array.from({ length: 50 }, (_, i) => 100 + i * 2 + Math.random());
      const result = trendForecast(series, 10);

      expect(result.predictions.length).toBe(10);
      // 预测应该延续趋势
      expect(result.predictions[0]).toBeGreaterThan(100);
    });

    it('should have confidence intervals', () => {
      const series = Array.from({ length: 50 }, (_, i) => 100 + i * 2 + Math.random() * 5);
      const result = trendForecast(series, 10);

      for (let i = 0; i < 10; i++) {
        expect(result.confidenceUpper[i]).toBeGreaterThan(result.confidenceLower[i]);
      }
    });

    it('should handle short series', () => {
      const result = trendForecast([100, 101, 102], 5);
      expect(result.predictions.length).toBe(5);
    });
  });

  describe('detectChangePoints', () => {
    it('should detect level shift', () => {
      const series = [
        ...Array(50).fill(100).map(v => v + (Math.random() - 0.5) * 2),
        ...Array(50).fill(120).map(v => v + (Math.random() - 0.5) * 2),
      ];
      const cps = detectChangePoints(series, 4);
      expect(cps.length).toBeGreaterThan(0);
    });

    it('should return empty for stable series', () => {
      const series = Array.from({ length: 100 }, () => 100);
      const cps = detectChangePoints(series, 5);
      // 完全稳定序列不应该有变点
      expect(cps.length).toBe(0);
    });

    it('should return empty for short data', () => {
      const cps = detectChangePoints([1, 2, 3], 5);
      expect(cps.length).toBe(0);
    });
  });
});
