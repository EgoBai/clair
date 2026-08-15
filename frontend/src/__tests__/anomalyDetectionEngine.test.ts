import { describe, it, expect } from 'vitest';
import { AnomalyDetectionEngine } from '../utils/anomalyDetectionEngine';

/**
 * 异常检测引擎测试
 * Z-score / IQR / 移动平均 / EWMA / 综合投票 / 时间序列 / 多维 / 趋势
 * (Rewritten to import the real AnomalyDetectionEngine class.)
 */

const engine = new AnomalyDetectionEngine();

describe('异常检测引擎', () => {
  describe('detectZScoreAnomalies', () => {
    it('returns empty for short data (length < 3)', () => {
      expect(engine.detectZScoreAnomalies([1], 3)).toHaveLength(0);
      expect(engine.detectZScoreAnomalies([1, 2], 3)).toHaveLength(0);
    });

    it('returns empty for uniform data (zero std)', () => {
      expect(engine.detectZScoreAnomalies([5, 5, 5, 5, 5])).toHaveLength(0);
    });

    it('detects extreme outliers', () => {
      const data = Array.from({ length: 50 }, (_, i) => 50 + (i % 2));
      data.push(500); // huge outlier
      const anomalies = engine.detectZScoreAnomalies(data, 3);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      const a = anomalies[anomalies.length - 1];
      expect(a.method).toBe('z-score');
      expect(a.value).toBe(500);
      expect(a).toHaveProperty('deviation');
      expect(a.score).toBeGreaterThan(0);
    });
  });

  describe('detectIQRAnomalies', () => {
    it('returns empty for short data (length < 4)', () => {
      expect(engine.detectIQRAnomalies([1, 2, 3])).toHaveLength(0);
    });

    it('detects outliers', () => {
      const data = Array.from({ length: 50 }, () => 50);
      data.push(500);
      const anomalies = engine.detectIQRAnomalies(data);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      expect(anomalies[0].method).toBe('iqr');
    });
  });

  describe('detectMovingAverageAnomalies', () => {
    it('returns empty for short data', () => {
      expect(engine.detectMovingAverageAnomalies([1, 2, 3], 10)).toHaveLength(0);
    });

    it('detects sudden jumps', () => {
      const data = Array.from({ length: 30 }, (_, i) => 50 + i * 0.01);
      data.push(500);
      const anomalies = engine.detectMovingAverageAnomalies(data, 10, 2);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      expect(anomalies[0].method).toBe('moving-average');
    });
  });

  describe('detectEWMAAnomalies', () => {
    it('returns empty for short data (length < 5)', () => {
      expect(engine.detectEWMAAnomalies([1, 2, 3, 4])).toHaveLength(0);
    });

    it('detects outliers', () => {
      // EWMA deviation for a single step is bounded by 1/sqrt(alpha) ≈ 2.236,
      // so a default threshold of 3 never fires on one outlier; use threshold 2 to exercise the detection path.
      const data = Array.from({ length: 30 }, () => 50);
      data.push(500);
      const anomalies = engine.detectEWMAAnomalies(data, 0.2, 2);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      expect(anomalies[0].method).toBe('ewma');
    });
  });

  describe('detectAnomalies (combined voting)', () => {
    it('returns a structured result', () => {
      const data = Array.from({ length: 40 }, (_, i) => 50 + (i % 2));
      data.push(500);
      const result = engine.detectAnomalies(data);
      expect(result.methods).toEqual(['z-score', 'iqr', 'moving-average']);
      expect(result.anomalies.length).toBeGreaterThanOrEqual(1);
      expect(result.normalRange).toHaveProperty('lower');
      expect(result.normalRange).toHaveProperty('upper');
      expect(result.anomalyRate).toBeGreaterThanOrEqual(0);
      expect(result.anomalyRate).toBeLessThanOrEqual(1);
    });

    it('detects consensus anomalies via multi-method voting', () => {
      const data = Array.from({ length: 60 }, () => 50);
      data.push(999);
      const result = engine.detectAnomalies(data, 3, 1.5, 20, 2);
      expect(result.consensusAnomalies.length).toBeGreaterThanOrEqual(1);
      expect(result.consensusAnomalies[0].method).toBeTruthy();
    });
  });

  describe('detectTimeSeriesAnomalies', () => {
    it('returns empty for short data', () => {
      expect(engine.detectTimeSeriesAnomalies([1, 2, 3], [1, 2, 3])).toHaveLength(0);
    });

    it('detects point anomalies', () => {
      const values = Array.from({ length: 60 }, (_, i) => 50 + (i % 5));
      const timestamps = values.map((_, i) => i);
      values[40] = 500; // in-range index (i < length - 1)
      const anomalies = engine.detectTimeSeriesAnomalies(values, timestamps, 20);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      expect(anomalies.some(a => a.type === 'point')).toBe(true);
    });
  });

  describe('detectMultivariateAnomalies', () => {
    it('returns empty for short data (length < 5)', () => {
      const dims = new Map([['a', [1, 2, 3, 4]], ['b', [1, 2, 3, 4]]]);
      expect(engine.detectMultivariateAnomalies(dims)).toHaveLength(0);
    });

    it('computes composite scores and flags anomalies', () => {
      const dimA = Array.from({ length: 20 }, () => 10);
      dimA[19] = 1000;
      const dimB = Array.from({ length: 20 }, () => 10);
      dimB[19] = 1000;
      const dims = new Map([['a', dimA], ['b', dimB]]);
      const results = engine.detectMultivariateAnomalies(dims);
      expect(results).toHaveLength(20);
      expect(results[19].isAnomaly).toBe(true);
      expect(results[19].topContributors).toContain('a');
      expect(results[19].compositeScore).toBeGreaterThan(0.7);
    });
  });

  describe('analyzeAnomalyTrend', () => {
    it('returns stable trend and empty rates for short data', () => {
      const result = engine.analyzeAnomalyTrend([1, 2, 3], 50);
      expect(result.trend).toBe('stable');
      expect(result.windowAnomalyRate).toHaveLength(0);
      expect(result.currentRisk).toBe('low');
    });

    it('computes window anomaly rates over a long series', () => {
      const data = Array.from({ length: 100 }, () => 50);
      const result = engine.analyzeAnomalyTrend(data, 50, 10);
      expect(result.windowAnomalyRate.length).toBeGreaterThan(0);
      expect(['increasing', 'decreasing', 'stable']).toContain(result.trend);
    });
  });
});
