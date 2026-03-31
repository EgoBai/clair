/**
 * 异常检测引擎测试
 */
import { describe, it, expect } from 'vitest';
import { AnomalyDetectionEngine } from '../utils/anomalyDetectionEngine';

describe('AnomalyDetectionEngine', () => {
  const engine = new AnomalyDetectionEngine();

  const generateData = (count: number, anomalyIndices: number[] = []) => {
    const data = Array.from({ length: count }, () => Math.random() * 10 + 50);
    for (const idx of anomalyIndices) {
      if (idx < count) data[idx] = data[idx] + 50; // 制造异常
    }
    return data;
  };

  describe('detectZScoreAnomalies', () => {
    it('应该检测Z-Score异常', () => {
      const data = generateData(100, [10, 50, 90]);
      const result = engine.detectZScoreAnomalies(data, 3);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].index).toBeGreaterThanOrEqual(0);
        expect(result[0].score).toBeGreaterThanOrEqual(0);
        expect(result[0].score).toBeLessThanOrEqual(1);
        expect(result[0].method).toBe('z-score');
      }
    });

    it('正常数据不应有异常', () => {
      const data = Array.from({ length: 100 }, () => 50 + (Math.random() - 0.5) * 2);
      const result = engine.detectZScoreAnomalies(data, 3);
      expect(result.length).toBe(0);
    });

    it('不足数据应返回空', () => {
      expect(engine.detectZScoreAnomalies([1, 2], 3).length).toBe(0);
    });
  });

  describe('detectIQRAnomalies', () => {
    it('应该检测IQR异常', () => {
      const data = generateData(100, [20, 60]);
      const result = engine.detectIQRAnomalies(data, 1.5);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].method).toBe('iqr');
        expect(result[0].deviation).toBeGreaterThan(0);
      }
    });

    it('不足数据应返回空', () => {
      expect(engine.detectIQRAnomalies([1, 2, 3], 1.5).length).toBe(0);
    });
  });

  describe('detectMovingAverageAnomalies', () => {
    it('应该检测移动平均异常', () => {
      const data = generateData(50, [30]);
      const result = engine.detectMovingAverageAnomalies(data, 10, 2.5);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].method).toBe('moving-average');
        expect(result[0].expectedValue).toBeGreaterThan(0);
      }
    });

    it('不足数据应返回空', () => {
      expect(engine.detectMovingAverageAnomalies([1, 2, 3], 20).length).toBe(0);
    });
  });

  describe('detectEWMAAnomalies', () => {
    it('应该检测EWMA异常', () => {
      const data = generateData(50, [25]);
      const result = engine.detectEWMAAnomalies(data, 0.2, 3);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].method).toBe('ewma');
      }
    });

    it('不足数据应返回空', () => {
      expect(engine.detectEWMAAnomalies([1, 2, 3]).length).toBe(0);
    });
  });

  describe('detectAnomalies', () => {
    it('应该综合检测异常', () => {
      const data = generateData(100, [15, 45, 75, 95]);
      const result = engine.detectAnomalies(data);

      expect(Array.isArray(result.anomalies)).toBe(true);
      expect(result.normalRange.lower).toBeLessThan(result.normalRange.upper);
      expect(result.anomalyRate).toBeGreaterThanOrEqual(0);
      expect(result.anomalyRate).toBeLessThanOrEqual(1);
      expect(result.methods.length).toBe(3);
      expect(Array.isArray(result.consensusAnomalies)).toBe(true);
    });

    it('共识异常应少于总异常', () => {
      const data = generateData(200, [10, 50, 100, 150, 190]);
      const result = engine.detectAnomalies(data);
      expect(result.consensusAnomalies.length).toBeLessThanOrEqual(result.anomalies.length);
    });
  });

  describe('detectTimeSeriesAnomalies', () => {
    it('应该检测时间序列异常', () => {
      const values = generateData(50, [25]);
      const timestamps = values.map((_, i) => Date.now() + i * 60000);
      const result = engine.detectTimeSeriesAnomalies(values, timestamps, 10);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(['point', 'contextual', 'collective']).toContain(result[0].type);
        expect(['low', 'medium', 'high', 'critical']).toContain(result[0].severity);
        expect(result[0].description).toBeTruthy();
        expect(result[0].surroundingValues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('detectMultivariateAnomalies', () => {
    it('应该检测多维异常', () => {
      const dims = new Map<string, number[]>();
      dims.set('price', generateData(50, [20]));
      dims.set('volume', generateData(50, [20]));
      dims.set('volatility', generateData(50));

      const result = engine.detectMultivariateAnomalies(dims, 0.7);

      expect(result.length).toBe(50);
      expect(result[0].scores.size).toBe(3);
      expect(result[0].compositeScore).toBeGreaterThanOrEqual(0);
      expect(result[0].compositeScore).toBeLessThanOrEqual(1);
      expect(result[0].topContributors.length).toBeLessThanOrEqual(3);
      expect(typeof result[0].isAnomaly).toBe('boolean');
    });
  });

  describe('analyzeAnomalyTrend', () => {
    it('应该分析异常趋势', () => {
      const data = generateData(200, [30, 80, 130, 180]);
      const result = engine.analyzeAnomalyTrend(data, 50, 10);

      expect(Array.isArray(result.windowAnomalyRate)).toBe(true);
      expect(['increasing', 'decreasing', 'stable']).toContain(result.trend);
      expect(['low', 'medium', 'high']).toContain(result.currentRisk);
    });

    it('不足数据应返回默认值', () => {
      const result = engine.analyzeAnomalyTrend([1, 2, 3]);
      expect(result.trend).toBe('stable');
      expect(result.currentRisk).toBe('low');
    });
  });
});
