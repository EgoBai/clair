import { describe, it, expect } from 'vitest';
import {
  DataAnomalyDetector,
  FinancialDataPrecision,
  DataConsistencyChecker,
} from '../utils/dataValidation';

// ==================== DataAnomalyDetector ====================

describe('DataAnomalyDetector', () => {
  const makeKLine = (
    tradeDate: string,
    open: number,
    close: number,
    high: number,
    low: number,
    volume: number,
    turnover = 1000000,
  ) => ({ tradeDate, open, close, high, low, volume, turnover });

  describe('detect', () => {
    it('should return empty report for empty data', () => {
      const detector = new DataAnomalyDetector();
      const report = detector.detect('000001.SZ', []);
      expect(report.symbol).toBe('000001.SZ');
      expect(report.anomalies).toHaveLength(0);
      expect(report.totalRecords).toBe(0);
      expect(report.qualityScore).toBe(100);
    });

    it('should pass clean data without any anomalies', () => {
      const detector = new DataAnomalyDetector();
      const data = [
        makeKLine('2024-01-02', 10.00, 10.20, 10.30, 9.90, 100000),
        makeKLine('2024-01-03', 10.20, 10.50, 10.60, 10.10, 120000),
        makeKLine('2024-01-04', 10.50, 10.30, 10.55, 10.25, 90000),
      ];
      const report = detector.detect('000001.SZ', data);
      expect(report.anomalyCount).toBe(0);
      expect(report.qualityScore).toBeCloseTo(100, 1);
    });
  });

  describe('checkBasicValidation — negative prices', () => {
    it('should detect negative prices', () => {
      const detector = new DataAnomalyDetector();
      const data = [makeKLine('2024-01-02', -5.00, 10.00, 11.00, 9.00, 100000)];
      const report = detector.detect('000001.SZ', data);
      const negatives = report.anomalies.filter(a => a.type === 'negative_price');
      expect(negatives.length).toBeGreaterThanOrEqual(1);
      expect(negatives[0].severity).toBe('critical');
    });

    it('should detect zero volume with non-zero turnover', () => {
      const detector = new DataAnomalyDetector();
      const data = [makeKLine('2024-01-02', 10.00, 10.20, 10.30, 9.90, 0, 500000)];
      const report = detector.detect('000001.SZ', data);
      const zeroVol = report.anomalies.filter(a => a.type === 'zero_volume');
      expect(zeroVol).toHaveLength(1);
    });

    it('should NOT flag zero volume with zero turnover (suspended stock)', () => {
      const detector = new DataAnomalyDetector();
      const data = [makeKLine('2024-01-02', 10.00, 10.20, 10.30, 9.90, 0, 0)];
      const report = detector.detect('000001.SZ', data);
      expect(report.anomalies.filter(a => a.type === 'zero_volume')).toHaveLength(0);
    });

    it('should detect precision errors for prices with too many decimals', () => {
      const detector = new DataAnomalyDetector();
      const data = [makeKLine('2024-01-02', 10.12345, 10.20, 10.30, 9.90, 100000)];
      const report = detector.detect('000001.SZ', data);
      const precisionErrors = report.anomalies.filter(a => a.type === 'precision_error');
      expect(precisionErrors.length).toBeGreaterThanOrEqual(1);
      expect(precisionErrors[0].severity).toBe('low');
    });
  });

  describe('checkPriceJumps', () => {
    it('should detect price jump exceeding threshold', () => {
      const detector = new DataAnomalyDetector({ priceJumpThreshold: 10 });
      const data = [
        makeKLine('2024-01-02', 10.00, 10.00, 10.50, 9.80, 100000),
        makeKLine('2024-01-03', 12.00, 12.50, 12.80, 11.90, 150000), // 25% jump
      ];
      const report = detector.detect('000001.SZ', data);
      const jumps = report.anomalies.filter(a => a.type === 'price_jump');
      expect(jumps.length).toBeGreaterThanOrEqual(1);
    });

    it('should NOT flag normal price movement', () => {
      const detector = new DataAnomalyDetector({ priceJumpThreshold: 10 });
      const data = [
        makeKLine('2024-01-02', 10.00, 10.00, 10.50, 9.80, 100000),
        makeKLine('2024-01-03', 10.50, 10.30, 10.70, 10.20, 120000), // 3% change
      ];
      const report = detector.detect('000001.SZ', data);
      expect(report.anomalies.filter(a => a.type === 'price_jump')).toHaveLength(0);
    });

    it('should skip when previous close is zero or negative', () => {
      const detector = new DataAnomalyDetector();
      const data = [
        makeKLine('2024-01-02', 0, 0, 0.50, 0, 100000),
        makeKLine('2024-01-03', 10.00, 10.00, 10.50, 9.80, 100000),
      ];
      const report = detector.detect('000001.SZ', data);
      // Should not crash, should have no price_jump from prev close=0
      expect(report.anomalies.filter(a => a.type === 'price_jump')).toHaveLength(0);
    });
  });

  describe('checkVolumeAnomalies', () => {
    it('should skip when data is shorter than window', () => {
      const detector = new DataAnomalyDetector({ volumeWindow: 20 });
      const data = Array.from({ length: 10 }, (_, i) =>
        makeKLine(`2024-01-${String(i + 2).padStart(2, '0')}`, 10, 10, 11, 9, 100000),
      );
      const report = detector.detect('000001.SZ', data);
      expect(report.anomalies.filter(a => a.type === 'volume_anomaly')).toHaveLength(0);
    });

    it('should detect volume anomaly when volume is extreme', () => {
      const detector = new DataAnomalyDetector({ volumeWindow: 5, volumeStdMultiplier: 2 });
      // Use varying volumes so std > 0
      const data = [
        makeKLine('2024-01-02', 10, 10, 11, 9, 100000),
        makeKLine('2024-01-03', 10, 10, 11, 9, 120000),
        makeKLine('2024-01-04', 10, 10, 11, 9, 90000),
        makeKLine('2024-01-05', 10, 10, 11, 9, 110000),
        makeKLine('2024-01-08', 10, 10, 11, 9, 105000),
        makeKLine('2024-01-09', 10, 10, 11, 9, 5000000), // massive spike
      ];
      const report = detector.detect('000001.SZ', data);
      const volAnomalies = report.anomalies.filter(a => a.type === 'volume_anomaly');
      expect(volAnomalies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkPriceLogic', () => {
    it('should detect high < max(open, close)', () => {
      const detector = new DataAnomalyDetector();
      const data = [makeKLine('2024-01-02', 10.00, 10.50, 10.20, 9.90, 100000)];
      const report = detector.detect('000001.SZ', data);
      const inversions = report.anomalies.filter(a => a.type === 'price_inversion');
      expect(inversions.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect low > min(open, close)', () => {
      const detector = new DataAnomalyDetector();
      const data = [makeKLine('2024-01-02', 10.00, 9.50, 10.00, 9.80, 100000)];
      const report = detector.detect('000001.SZ', data);
      const inversions = report.anomalies.filter(a => a.type === 'price_inversion');
      expect(inversions.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect high < low', () => {
      const detector = new DataAnomalyDetector();
      const data = [makeKLine('2024-01-02', 10.00, 10.00, 9.50, 10.50, 100000)];
      const report = detector.detect('000001.SZ', data);
      const inversions = report.anomalies.filter(a => a.type === 'price_inversion');
      expect(inversions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkDataContinuity', () => {
    it('should detect missing dates (gap > 5 days)', () => {
      const detector = new DataAnomalyDetector();
      const data = [
        makeKLine('2024-01-02', 10, 10, 11, 9, 100000),
        makeKLine('2024-01-15', 10, 10, 11, 9, 100000), // 13 days later
      ];
      const report = detector.detect('000001.SZ', data);
      const missing = report.anomalies.filter(a => a.type === 'missing_data');
      expect(missing).toHaveLength(1);
      expect(missing[0].severity).toBe('medium');
    });

    it('should NOT flag weekend gaps (3-4 days)', () => {
      const detector = new DataAnomalyDetector();
      const data = [
        makeKLine('2024-01-05', 10, 10, 11, 9, 100000), // Friday
        makeKLine('2024-01-08', 10, 10, 11, 9, 100000), // Monday (3 days)
      ];
      const report = detector.detect('000001.SZ', data);
      expect(report.anomalies.filter(a => a.type === 'missing_data')).toHaveLength(0);
    });
  });

  describe('checkAmplitudeLimit', () => {
    it('should detect change exceeding limit', () => {
      const detector = new DataAnomalyDetector({ limitUpPercent: 10, limitDownPercent: 10 });
      const data = [
        makeKLine('2024-01-02', 10, 10, 11, 9, 100000),
        makeKLine('2024-01-03', 12, 12.50, 13, 11.50, 200000), // 25% gain
      ];
      const report = detector.detect('000001.SZ', data);
      const exceeded = report.anomalies.filter(a => a.type === 'amplitude_exceeded');
      expect(exceeded.length).toBeGreaterThanOrEqual(1);
    });

    it('should NOT flag movement within limit', () => {
      const detector = new DataAnomalyDetector({ limitUpPercent: 20, limitDownPercent: 20 });
      const data = [
        makeKLine('2024-01-02', 10, 10, 11, 9, 100000),
        makeKLine('2024-01-03', 10.50, 11, 11.20, 10.30, 100000),
      ];
      const report = detector.detect('000001.SZ', data);
      expect(report.anomalies.filter(a => a.type === 'amplitude_exceeded')).toHaveLength(0);
    });
  });

  describe('custom configuration', () => {
    it('should accept partial config', () => {
      const detector = new DataAnomalyDetector({ priceJumpThreshold: 5 });
      const data = [
        makeKLine('2024-01-02', 10, 10, 11, 9, 100000),
        makeKLine('2024-01-03', 10.60, 10.60, 11.00, 10.30, 100000), // 6% jump
      ];
      const report = detector.detect('000001.SZ', data);
      expect(report.anomalies.filter(a => a.type === 'price_jump').length).toBeGreaterThanOrEqual(1);
    });

    it('should use defaults when no config provided', () => {
      const detector = new DataAnomalyDetector();
      // Default priceJumpThreshold is 15%, so 13% should NOT flag from checkPriceJumps
      // But checkOpeningPrice has its own price_jump threshold of 10%
      // Use same close prices to avoid opening gap triggering
      const data = [
        makeKLine('2024-01-02', 10, 10, 11, 9, 100000),
        makeKLine('2024-01-03', 10, 11.30, 11.80, 10, 100000), // 13% close change, but no opening gap
      ];
      const report = detector.detect('000001.SZ', data);
      // Should only have price_jump from checkPriceJumps if > 15%
      const priceJumps = report.anomalies.filter(
        a => a.type === 'price_jump' && a.field === 'close',
      );
      expect(priceJumps).toHaveLength(0);
    });
  });
});

// ==================== FinancialDataPrecision ====================

describe('FinancialDataPrecision', () => {
  describe('normalizePE', () => {
    it('should normalize PE to 2 decimal places', () => {
      expect(FinancialDataPrecision.normalizePE(15.1234)).toBe(15.12);
    });

    it('should return null for null/undefined', () => {
      expect(FinancialDataPrecision.normalizePE(null)).toBeNull();
      expect(FinancialDataPrecision.normalizePE(undefined)).toBeNull();
    });

    it('should return null for Infinity/NaN', () => {
      expect(FinancialDataPrecision.normalizePE(Infinity)).toBeNull();
      expect(FinancialDataPrecision.normalizePE(NaN)).toBeNull();
    });

    it('should return null for extreme values', () => {
      expect(FinancialDataPrecision.normalizePE(1000)).toBeNull();
      expect(FinancialDataPrecision.normalizePE(-600)).toBeNull();
    });

    it('should keep values within range', () => {
      expect(FinancialDataPrecision.normalizePE(-500)).toBe(-500);
      expect(FinancialDataPrecision.normalizePE(500)).toBe(500);
    });
  });

  describe('normalizePB', () => {
    it('should normalize PB to 2 decimal places', () => {
      expect(FinancialDataPrecision.normalizePB(2.3456)).toBe(2.35);
    });

    it('should return null for out-of-range values', () => {
      expect(FinancialDataPrecision.normalizePB(200)).toBeNull();
      expect(FinancialDataPrecision.normalizePB(-100)).toBeNull();
    });

    it('should return null for null/undefined/NaN', () => {
      expect(FinancialDataPrecision.normalizePB(null)).toBeNull();
      expect(FinancialDataPrecision.normalizePB(undefined)).toBeNull();
      expect(FinancialDataPrecision.normalizePB(NaN)).toBeNull();
    });
  });

  describe('normalizeROE', () => {
    it('should normalize ROE to 2 decimal places', () => {
      expect(FinancialDataPrecision.normalizeROE(15.6789)).toBe(15.68);
    });

    it('should return null for out-of-bounds', () => {
      expect(FinancialDataPrecision.normalizeROE(150)).toBeNull();
      expect(FinancialDataPrecision.normalizeROE(-200)).toBeNull();
    });

    it('should handle edge values at the boundary', () => {
      expect(FinancialDataPrecision.normalizeROE(100)).toBe(100);
      expect(FinancialDataPrecision.normalizeROE(-100)).toBe(-100);
    });
  });

  describe('normalizeAmount', () => {
    it('should normalize amount to 2 decimal places', () => {
      expect(FinancialDataPrecision.normalizeAmount(1234.567)).toBe(1234.57);
    });

    it('should return null for negative amounts', () => {
      expect(FinancialDataPrecision.normalizeAmount(-50)).toBeNull();
    });

    it('should return null for null/undefined/NaN', () => {
      expect(FinancialDataPrecision.normalizeAmount(null)).toBeNull();
      expect(FinancialDataPrecision.normalizeAmount(undefined)).toBeNull();
      expect(FinancialDataPrecision.normalizeAmount(NaN)).toBeNull();
    });

    it('should handle zero', () => {
      expect(FinancialDataPrecision.normalizeAmount(0)).toBe(0);
    });
  });

  describe('normalizeVolume', () => {
    it('should round volume to integer', () => {
      expect(FinancialDataPrecision.normalizeVolume(123456.7)).toBe(123457);
    });

    it('should return null for negative volume', () => {
      expect(FinancialDataPrecision.normalizeVolume(-100)).toBeNull();
    });

    it('should return null for null/undefined/Infinity', () => {
      expect(FinancialDataPrecision.normalizeVolume(null)).toBeNull();
      expect(FinancialDataPrecision.normalizeVolume(undefined)).toBeNull();
      expect(FinancialDataPrecision.normalizeVolume(Infinity)).toBeNull();
    });
  });

  describe('normalizeChangePercent', () => {
    it('should normalize to 2 decimal places', () => {
      expect(FinancialDataPrecision.normalizeChangePercent(5.1234)).toBe(5.12);
    });

    it('should return null for null/undefined/NaN', () => {
      expect(FinancialDataPrecision.normalizeChangePercent(null)).toBeNull();
      expect(FinancialDataPrecision.normalizeChangePercent(undefined)).toBeNull();
      expect(FinancialDataPrecision.normalizeChangePercent(NaN)).toBeNull();
    });
  });
});

// ==================== DataConsistencyChecker ====================

describe('DataConsistencyChecker', () => {
  describe('validateQuoteRecord', () => {
    it('should pass a valid record', () => {
      const record = {
        trade_date: '2024-01-02',
        open_price: 10.00,
        close_price: 10.50,
        high_price: 10.80,
        low_price: 9.90,
        volume: 100000,
        turnover: 5000000,
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should flag missing required fields', () => {
      const result = DataConsistencyChecker.validateQuoteRecord({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    });

    it('should flag negative volume', () => {
      const record = {
        trade_date: '2024-01-02',
        open_price: 10,
        close_price: 10.50,
        high_price: 10.80,
        low_price: 9.90,
        volume: -100,
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('volume'))).toBe(true);
    });

    it('should flag high < low', () => {
      const record = {
        trade_date: '2024-01-02',
        open_price: 10,
        close_price: 10.50,
        high_price: 9.00,
        low_price: 10.00,
        volume: 100000,
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('high_price'))).toBe(true);
    });

    it('should flag volume > 0 with zero turnover', () => {
      const record = {
        trade_date: '2024-01-02',
        open_price: 10,
        close_price: 10.50,
        high_price: 10.80,
        low_price: 9.90,
        volume: 100000,
        turnover: 0,
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(false);
    });
  });

  describe('compareData', () => {
    it('should return match=true for identical data', () => {
      const frontend = { close: 10.50, volume: 100000 };
      const backend = { close: 10.50, volume: 100000 };
      const result = DataConsistencyChecker.compareData(frontend, backend, ['close', 'volume']);
      expect(result.match).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it('should detect mismatched fields', () => {
      const frontend = { close: 10.50, volume: 100000 };
      const backend = { close: 11.00, volume: 100000 };
      const result = DataConsistencyChecker.compareData(frontend, backend, ['close', 'volume']);
      expect(result.match).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].field).toBe('close');
    });

    it('should allow small numeric tolerance of 0.01', () => {
      const frontend = { close: 10.505 };
      const backend = { close: 10.50 };
      const result = DataConsistencyChecker.compareData(frontend, backend, ['close']);
      expect(result.match).toBe(true);
    });
  });
});
