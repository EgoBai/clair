import { describe, it, expect } from 'vitest';
import {
  detectMissingData,
  detectOutliers,
  detectDuplicates,
  detectStaleData,
  computeCompletenessScore,
  computeAccuracyScore,
  computeConsistencyScore,
  evaluateDataQuality,
  generateQualityReport,
  type DataPoint,
} from '../services/dataQualityScoringEngine';

describe('dataQualityScoringEngine', () => {
  const makeData = (n: number, basePrice = 100): DataPoint[] =>
    Array.from({ length: n }, (_, i) => ({
      timestamp: 1000 + i * 60000,
      open: basePrice + i * 0.1,
      high: basePrice + i * 0.1 + 0.5,
      low: basePrice + i * 0.1 - 0.5,
      close: basePrice + i * 0.1,
      volume: 10000 + Math.floor(Math.random() * 1000),
    }));

  describe('detectMissingData', () => {
    it('should detect gaps in data', () => {
      const data: (DataPoint | null)[] = [
        { timestamp: 0, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 60000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 300000, open: 100, high: 101, low: 99, close: 100, volume: 1000 }, // gap
      ];
      const issues = detectMissingData(data, 60000);
      expect(issues.some(i => i.type === 'gap')).toBe(true);
    });

    it('should detect missing data ratio', () => {
      const data: (DataPoint | null)[] = [
        { timestamp: 0, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        null,
        null,
        { timestamp: 180000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      ];
      const issues = detectMissingData(data, 60000);
      expect(issues.some(i => i.type === 'missing')).toBe(true);
    });

    it('should pass clean data', () => {
      const data = makeData(10);
      const issues = detectMissingData(data, 60000);
      expect(issues.filter(i => i.type === 'missing')).toHaveLength(0);
    });
  });

  describe('detectOutliers', () => {
    it('should detect return outliers', () => {
      const data = makeData(20);
      data[10] = { ...data[10], close: data[10].close * 5 }; // 400% return
      const issues = detectOutliers(data);
      expect(issues.some(i => i.type === 'outlier')).toBe(true);
    });

    it('should detect OHLC inconsistencies', () => {
      const data: DataPoint[] = [
        { timestamp: 0, open: 100, high: 99, low: 101, close: 100, volume: 1000 },
        { timestamp: 60000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 120000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 180000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 240000, open: 100, high: 99, low: 101, close: 100, volume: 1000 },
      ];
      const issues = detectOutliers(data);
      expect(issues.some(i => i.type === 'inconsistent')).toBe(true);
    });

    it('should handle small datasets', () => {
      expect(detectOutliers(makeData(2))).toHaveLength(0);
    });
  });

  describe('detectDuplicates', () => {
    it('should detect duplicate timestamps', () => {
      const data: DataPoint[] = [
        { timestamp: 0, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 0, open: 101, high: 102, low: 100, close: 101, volume: 2000 },
      ];
      const issues = detectDuplicates(data);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('duplicate');
    });

    it('should pass unique data', () => {
      expect(detectDuplicates(makeData(10))).toHaveLength(0);
    });
  });

  describe('detectStaleData', () => {
    it('should detect stale data', () => {
      const data = makeData(5);
      const issues = detectStaleData(data, data[4].timestamp + 1000000);
      expect(issues.some(i => i.type === 'stale')).toBe(true);
    });

    it('should handle empty data', () => {
      const issues = detectStaleData([], Date.now());
      expect(issues[0].severity).toBe('critical');
    });

    it('should pass fresh data', () => {
      const data = makeData(5);
      const issues = detectStaleData(data, data[4].timestamp + 10000);
      expect(issues).toHaveLength(0);
    });
  });

  describe('computeCompletenessScore', () => {
    it('should return 1 for complete data', () => {
      expect(computeCompletenessScore(makeData(10))).toBe(1);
    });

    it('should reduce score for missing data', () => {
      const data: (DataPoint | null)[] = [makeData(1)[0], null, null, makeData(1)[0]];
      expect(computeCompletenessScore(data)).toBe(0.5);
    });

    it('should return 0 for empty data', () => {
      expect(computeCompletenessScore([])).toBe(0);
    });
  });

  describe('computeAccuracyScore', () => {
    it('should return 1 for no issues', () => {
      expect(computeAccuracyScore([])).toBe(1);
    });

    it('should deduct for accuracy issues', () => {
      const issues = [{ type: 'outlier' as const, severity: 'high' as const, description: '', affectedFields: [] }];
      expect(computeAccuracyScore(issues)).toBeLessThan(1);
    });
  });

  describe('computeConsistencyScore', () => {
    it('should return 1 for consistent data', () => {
      expect(computeConsistencyScore(makeData(20))).toBe(1);
    });

    it('should reduce score for inconsistent data', () => {
      const data = makeData(10);
      data[5] = { ...data[5], close: data[5].close * 3 }; // 200% jump
      const score = computeConsistencyScore(data);
      expect(score).toBeLessThan(1);
    });

    it('should return 1 for single data point', () => {
      expect(computeConsistencyScore(makeData(1))).toBe(1);
    });
  });

  describe('evaluateDataQuality', () => {
    it('should return quality score with grade', () => {
      const data = makeData(100);
      const score = evaluateDataQuality('TEST', data, data[99].timestamp + 10000);
      expect(score.symbol).toBe('TEST');
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(score.grade);
    });

    it('should return low grade for empty data', () => {
      const score = evaluateDataQuality('EMPTY', [], Date.now());
      expect(['D', 'F']).toContain(score.grade);
    });
  });

  describe('generateQualityReport', () => {
    it('should generate comprehensive report', () => {
      const evaluations = [
        evaluateDataQuality('A', makeData(50), Date.now()),
        evaluateDataQuality('B', makeData(30), Date.now()),
      ];
      const report = generateQualityReport(evaluations);
      expect(report.totalSymbols).toBe(2);
      expect(report.passingSymbols + report.failingSymbols).toBe(2);
      expect(report.avgScore).toBeGreaterThan(0);
    });

    it('should handle empty evaluations', () => {
      const report = generateQualityReport([]);
      expect(report.totalSymbols).toBe(0);
      expect(report.avgScore).toBe(0);
    });
  });
});
