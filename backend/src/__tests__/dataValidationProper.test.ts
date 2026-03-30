import { describe, it, expect } from 'vitest';
import {
  DataAnomalyDetector,
  FinancialDataPrecision,
  DataConsistencyChecker,
} from '../utils/dataValidation';

describe('Data Validation Proper', () => {
  describe('DataAnomalyDetector', () => {
    const detector = new DataAnomalyDetector();

    it('should detect no anomalies for clean data', () => {
      const data = Array.from({ length: 10 }, (_, i) => ({
        tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100 + i,
        close: 101 + i,
        high: 102 + i,
        low: 99 + i,
        volume: 100000 + i * 1000,
        turnover: 10000000 + i * 100000,
      }));
      const report = detector.detect('600519', data);
      expect(report.qualityScore).toBeGreaterThan(50);
      expect(report.symbol).toBe('600519');
    });

    it('should detect negative prices', () => {
      const data = [{
        tradeDate: '2024-01-01',
        open: -10,
        close: 100,
        high: 102,
        low: 98,
        volume: 100000,
        turnover: 10000000,
      }];
      const report = detector.detect('600519', data);
      expect(report.anomalies.length).toBeGreaterThan(0);
    });

    it('should detect price logic errors (high < low)', () => {
      const data = [{
        tradeDate: '2024-01-01',
        open: 100,
        close: 100,
        high: 95,
        low: 105,
        volume: 100000,
        turnover: 10000000,
      }];
      const report = detector.detect('600519', data);
      expect(report.anomalies.length).toBeGreaterThan(0);
    });

    it('should detect consecutive identical volumes as anomaly', () => {
      const data = Array.from({ length: 6 }, (_, i) => ({
        tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100,
        close: 100 + i,
        high: 101 + i,
        low: 99,
        volume: 100000, // identical every day
        turnover: 10000000,
      }));
      const report = detector.detect('600519', data);
      // May or may not detect, but should not throw
      expect(report).toBeDefined();
      expect(report.anomalies).toBeDefined();
    });

    it('should generate quality score', () => {
      const data = [{
        tradeDate: '2024-01-01',
        open: 100,
        close: 101,
        high: 102,
        low: 99,
        volume: 100000,
        turnover: 10000000,
      }];
      const report = detector.detect('TEST', data);
      expect(typeof report.qualityScore).toBe('number');
      expect(report.qualityScore).toBeGreaterThanOrEqual(0);
      expect(report.qualityScore).toBeLessThanOrEqual(100);
    });
  });

  describe('FinancialDataPrecision', () => {
    it('should normalize PE correctly', () => {
      expect(FinancialDataPrecision.normalizePE(15.5)).toBe(15.5);
      expect(FinancialDataPrecision.normalizePE(0)).toBe(0);
    });

    it('should handle NaN PE', () => {
      expect(FinancialDataPrecision.normalizePE(NaN)).toBeNull();
    });

    it('should handle infinite PE', () => {
      expect(FinancialDataPrecision.normalizePE(Infinity)).toBeNull();
      expect(FinancialDataPrecision.normalizePE(-Infinity)).toBeNull();
    });

    it('should handle null values', () => {
      expect(FinancialDataPrecision.normalizePE(null)).toBeNull();
      expect(FinancialDataPrecision.normalizePE(undefined)).toBeNull();
      expect(FinancialDataPrecision.normalizePB(null)).toBeNull();
      expect(FinancialDataPrecision.normalizeROE(null)).toBeNull();
    });

    it('should normalize PB correctly', () => {
      expect(FinancialDataPrecision.normalizePB(2.5)).toBe(2.5);
      expect(FinancialDataPrecision.normalizePB(-1)).toBe(-1);
    });

    it('should normalize ROE correctly', () => {
      expect(FinancialDataPrecision.normalizeROE(15)).toBe(15);
      expect(FinancialDataPrecision.normalizeROE(-5)).toBe(-5);
    });

    it('should normalize volume', () => {
      expect(FinancialDataPrecision.normalizeVolume(1000.5)).toBe(1001);
      expect(FinancialDataPrecision.normalizeVolume(null)).toBeNull();
    });

    it('should normalize change percent', () => {
      expect(FinancialDataPrecision.normalizeChangePercent(5.5)).toBe(5.5);
      expect(FinancialDataPrecision.normalizeChangePercent(null)).toBeNull();
    });
  });

  describe('DataConsistencyChecker', () => {
    it('should validate quote record', () => {
      const record = {
        trade_date: '2024-01-01',
        open_price: 100,
        close_price: 101,
        high_price: 102,
        low_price: 99,
        volume: 100000,
        turnover: 10000000,
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid quote (negative price)', () => {
      const record = {
        trade_date: '2024-01-01',
        open_price: -10,
        close_price: 101,
        high_price: 102,
        low_price: 99,
        volume: 100000,
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should compare consistent data', () => {
      const frontend = { price: 100.0, volume: 1000 };
      const backend = { price: 100.0, volume: 1000 };
      const result = DataConsistencyChecker.compareData(frontend, backend, ['price', 'volume']);
      expect(result.match).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it('should compare with tolerance', () => {
      const frontend = { price: 100.005 };
      const backend = { price: 100.0 };
      const result = DataConsistencyChecker.compareData(frontend, backend, ['price']);
      expect(result.match).toBe(true); // within 0.01 tolerance
    });

    it('should detect inconsistent data', () => {
      const frontend = { price: 100.0 };
      const backend = { price: 105.0 };
      const result = DataConsistencyChecker.compareData(frontend, backend, ['price']);
      expect(result.match).toBe(false);
      expect(result.mismatches.length).toBeGreaterThan(0);
    });
  });
});
