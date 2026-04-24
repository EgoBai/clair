import { describe, it, expect } from 'vitest';
import {
  validateOHLCV,
  detectOutliers,
  detectMissingData,
  generateQualityReport,
  cleanOHLCV,
} from '../utils/dataQualityEngine';
import type { OHLCVRecord } from '../utils/dataQualityEngine';

function makeOHLCV(n: number, startPrice: number = 100): OHLCVRecord[] {
  const data: OHLCVRecord[] = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const change = (Math.random() - 0.5) * 2;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    data.push({
      date: new Date(2024, 0, i + 1).toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.floor(Math.random() * 10000) + 1000,
    });
    price = close;
  }
  return data;
}

describe('Data Quality Engine', () => {
  describe('validateOHLCV', () => {
    it('should pass clean data', () => {
      const data = makeOHLCV(50);
      const checks = validateOHLCV(data);

      for (const check of checks) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('passed');
        expect(check).toHaveProperty('severity');
        expect(check).toHaveProperty('message');
        expect(Array.isArray(check.affectedRows)).toBe(true);
      }

      const errorChecks = checks.filter(c => c.severity === 'error');
      expect(errorChecks.every(c => c.passed)).toBe(true);
    });

    it('should detect high < low violations', () => {
      const data = makeOHLCV(5);
      data[2] = { ...data[2], high: data[2].low - 1 };

      const checks = validateOHLCV(data);
      const highLow = checks.find(c => c.name === 'high_gte_low');
      expect(highLow?.passed).toBe(false);
      expect(highLow?.affectedRows).toContain(2);
    });

    it('should detect negative volume', () => {
      const data = makeOHLCV(5);
      data[1] = { ...data[1], volume: -100 };

      const checks = validateOHLCV(data);
      const volCheck = checks.find(c => c.name === 'non_negative_volume');
      expect(volCheck?.passed).toBe(false);
    });

    it('should detect date ordering issues', () => {
      const data = makeOHLCV(5);
      data[3] = { ...data[3], date: data[2].date };

      const checks = validateOHLCV(data);
      const dateCheck = checks.find(c => c.name === 'date_ordering');
      expect(dateCheck?.passed).toBe(false);
    });
  });

  describe('detectOutliers', () => {
    it('should detect outliers', () => {
      const values = [100, 101, 99, 100, 101, 99, 100, 1000, 100, 99];
      const outliers = detectOutliers(values, 2);

      expect(outliers.length).toBeGreaterThan(0);
      expect(outliers[0].index).toBe(7); // 1000 is the outlier
      expect(outliers[0].type).toBe('outlier');
    });

    it('should handle no outliers', () => {
      const values = Array(100).fill(0).map(() => 100 + (Math.random() - 0.5) * 2);
      const outliers = detectOutliers(values, 3);
      expect(outliers.length).toBe(0);
    });

    it('should handle empty array', () => {
      expect(detectOutliers([])).toEqual([]);
    });
  });

  describe('detectMissingData', () => {
    it('should detect gaps', () => {
      const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-10', '2024-01-11'];
      const result = detectMissingData(dates);

      expect(result.gapCount).toBeGreaterThan(0);
      expect(result.missingDates.length).toBeGreaterThan(0);
      expect(result.completeness).toBeLessThan(1);
    });

    it('should handle continuous data', () => {
      const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'];
      const result = detectMissingData(dates);
      expect(result.completeness).toBeCloseTo(1, 1);
    });

    it('should handle empty dates', () => {
      const result = detectMissingData([]);
      expect(result.completeness).toBe(1);
    });
  });

  describe('generateQualityReport', () => {
    it('should generate quality report', () => {
      const data = makeOHLCV(50);
      const report = generateQualityReport(data);

      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      expect(report.completeness).toBeGreaterThanOrEqual(0);
      expect(report.accuracy).toBeGreaterThanOrEqual(0);
      expect(report.consistency).toBeGreaterThanOrEqual(0);
      expect(report.timeliness).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(report.anomalies)).toBe(true);
      expect(report.checks.length).toBeGreaterThan(0);
    });

    it('should give high score to clean data', () => {
      const data = makeOHLCV(100);
      const report = generateQualityReport(data);
      expect(report.accuracy).toBe(1);
    });
  });

  describe('cleanOHLCV', () => {
    it('should fix high/low violations', () => {
      const data = makeOHLCV(5);
      data[2] = { ...data[2], high: data[2].low - 1, low: data[2].high + 1 };

      const cleaned = cleanOHLCV(data);
      expect(cleaned[2].high).toBeGreaterThanOrEqual(cleaned[2].low);
    });

    it('should remove zero-price records', () => {
      const data = makeOHLCV(5);
      data[1] = { ...data[1], close: 0 };

      const cleaned = cleanOHLCV(data);
      expect(cleaned.length).toBe(4);
    });

    it('should remove duplicate dates', () => {
      const data = makeOHLCV(5);
      data[3] = { ...data[3], date: data[2].date };

      const cleaned = cleanOHLCV(data);
      expect(cleaned.length).toBe(4);
    });
  });

  describe('edge cases', () => {
    it('should handle single record', () => {
      const data = makeOHLCV(1);
      const report = generateQualityReport(data);
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle constant prices', () => {
      const data: OHLCVRecord[] = Array(10).fill(null).map((_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString().split('T')[0],
        open: 100, high: 100, low: 100, close: 100, volume: 1000,
      }));

      const checks = validateOHLCV(data);
      expect(checks.filter(c => !c.passed && c.severity === 'error').length).toBe(0);
    });
  });
});
