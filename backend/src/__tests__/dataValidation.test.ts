import { describe, it, expect, beforeEach } from 'vitest';
import { DataAnomalyDetector, DataAnomaly, AnomalyReport } from '../utils/dataValidation';

interface KLineData {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
}

function makeKLine(date: string, close: number, volume: number = 10000, options: Partial<KLineData> = {}): KLineData {
  const open = options.open ?? close - 0.5;
  return {
    tradeDate: date,
    open,
    close,
    high: options.high ?? Math.max(open, close) + 0.3,
    low: options.low ?? Math.min(open, close) - 0.3,
    volume,
    turnover: options.turnover ?? volume * close,
    ...options,
  };
}

describe('dataValidation', () => {
  let detector: DataAnomalyDetector;

  beforeEach(() => {
    detector = new DataAnomalyDetector();
  });

  describe('detect', () => {
    it('should return empty report for empty data', () => {
      const report = detector.detect('000001', []);
      expect(report.anomalyCount).toBe(0);
      expect(report.qualityScore).toBe(100);
      expect(report.totalRecords).toBe(0);
    });

    it('should return clean report for valid data', () => {
      const data: KLineData[] = [
        makeKLine('2024-01-02', 10),
        makeKLine('2024-01-03', 10.2),
        makeKLine('2024-01-04', 9.8),
      ];
      const report = detector.detect('000001', data);
      // May have minor precision issues, but no critical ones
      const critical = report.anomalies.filter(a => a.severity === 'critical');
      expect(critical).toHaveLength(0);
    });

    it('should detect negative prices', () => {
      const data: KLineData[] = [
        makeKLine('2024-01-02', 10),
        { tradeDate: '2024-01-03', open: -1, close: -1, high: -0.5, low: -2, volume: 1000, turnover: -1000 },
      ];
      const report = detector.detect('000001', data);
      const anomaly = report.anomalies.find(a => a.type === 'negative_price');
      expect(anomaly).toBeDefined();
      expect(anomaly?.severity).toBe('critical');
    });

    it('should detect price inversion (high < close)', () => {
      const data: KLineData[] = [
        makeKLine('2024-01-02', 10, 1000, { high: 9.5 }), // high < close
      ];
      const report = detector.detect('000001', data);
      const anomaly = report.anomalies.find(a => a.type === 'price_inversion');
      expect(anomaly).toBeDefined();
      expect(anomaly?.severity).toBe('critical');
    });

    it('should detect price inversion (low > open)', () => {
      const data: KLineData[] = [
        { tradeDate: '2024-01-02', open: 10, close: 10.5, high: 11, low: 10.3, volume: 1000, turnover: 10250 },
      ];
      const report = detector.detect('000001', data);
      // low (10.3) > min(open, close) (10) — this should trigger inversion
      // Actually min(10, 10.5) = 10, and 10.3 > 10, so it IS an inversion
      const anomaly = report.anomalies.find(a => a.type === 'price_inversion' && a.field === 'low');
      expect(anomaly).toBeDefined();
    });

    it('should detect high < low inversion', () => {
      const data: KLineData[] = [
        { tradeDate: '2024-01-02', open: 10, close: 10, high: 9, low: 11, volume: 1000, turnover: 10000 },
      ];
      const report = detector.detect('000001', data);
      const anomaly = report.anomalies.find(a =>
        a.type === 'price_inversion' && a.message.includes('最高价')
      );
      expect(anomaly).toBeDefined();
    });

    it('should detect data continuity gaps', () => {
      const data: KLineData[] = [
        makeKLine('2024-01-02', 10),
        makeKLine('2024-01-20', 10.5), // 18-day gap
      ];
      const report = detector.detect('000001', data);
      const anomaly = report.anomalies.find(a => a.type === 'missing_data');
      expect(anomaly).toBeDefined();
    });

    it('should not flag normal weekends as gaps', () => {
      const data: KLineData[] = [
        makeKLine('2024-01-05', 10),   // Friday
        makeKLine('2024-01-08', 10.2), // Monday (3-day gap)
      ];
      const report = detector.detect('000001', data);
      const gapAnomalies = report.anomalies.filter(a => a.type === 'missing_data');
      expect(gapAnomalies).toHaveLength(0);
    });

    it('should detect zero volume with non-zero turnover', () => {
      const data: KLineData[] = [
        { tradeDate: '2024-01-02', open: 10, close: 10, high: 10, low: 10, volume: 0, turnover: 5000 },
      ];
      const report = detector.detect('000001', data);
      const anomaly = report.anomalies.find(a => a.type === 'zero_volume');
      expect(anomaly).toBeDefined();
      expect(anomaly?.severity).toBe('high');
    });

    it('should calculate quality score based on anomalies', () => {
      const data: KLineData[] = [
        makeKLine('2024-01-02', 10),
        { tradeDate: '2024-01-03', open: -1, close: -1, high: -0.5, low: -2, volume: 1000, turnover: -1000 },
        makeKLine('2024-01-04', 10.5),
      ];
      const report = detector.detect('000001', data);
      expect(report.qualityScore).toBeLessThan(100);
    });

    it('should detect volume anomalies with enough data', () => {
      // Create 25 days of data with consistent volume, then a spike
      const data: KLineData[] = [];
      for (let i = 0; i < 25; i++) {
        data.push(makeKLine(`2024-01-${String(i + 2).padStart(2, '0')}`, 10 + Math.random() * 0.5, 10000 + Math.random() * 100));
      }
      // Volume spike
      data.push(makeKLine('2024-02-05', 10.3, 5000000)); // 500x normal volume

      const report = detector.detect('000001', data);
      const volAnomaly = report.anomalies.find(a => a.type === 'volume_anomaly');
      expect(volAnomaly).toBeDefined();
    });

    it('should sort data by date before analysis', () => {
      const data: KLineData[] = [
        makeKLine('2024-01-05', 10),
        makeKLine('2024-01-03', 9),  // out of order
        makeKLine('2024-01-04', 9.5),
      ];
      const report = detector.detect('000001', data);
      // Should still work without errors
      expect(report.totalRecords).toBe(3);
      expect(report.symbol).toBe('000001');
    });

    it('should include anomaly details', () => {
      const data: KLineData[] = [
        { tradeDate: '2024-01-02', open: -1, close: -1, high: -0.5, low: -2, volume: 1000, turnover: -1000 },
      ];
      const report = detector.detect('000001', data);
      const anomaly = report.anomalies[0];
      expect(anomaly.tradeDate).toBe('2024-01-02');
      expect(anomaly.field).toBeDefined();
      expect(anomaly.severity).toBeDefined();
    });
  });
});
