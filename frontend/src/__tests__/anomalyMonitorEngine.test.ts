import { describe, it, expect } from 'vitest';
import {
  detectLimitMove,
  detectVolumeSurge,
  detectPriceMovement,
  detectTailMovement,
  scanAnomalies,
  summarizeAnomalies,
  type StockSnapshot,
} from '../utils/anomalyMonitorEngine';

const mockStock = (overrides: Partial<StockSnapshot> = {}): StockSnapshot => ({
  code: 'SH600001',
  name: '测试股票',
  price: 10.5,
  preClose: 10.0,
  open: 10.1,
  high: 10.8,
  low: 9.9,
  volume: 100000,
  avgVolume20: 80000,
  amount: 1050000,
  time: '10:30',
  turnover: 1.5,
  buy1: 10.49,
  sell1: 10.51,
  pe: 20,
  pb: 2.5,
  ...overrides,
});

describe('异动监控引擎', () => {
  describe('detectLimitMove', () => {
    it('should detect limit up', () => {
      const stock = mockStock({ price: 11.0, preClose: 10.0, code: 'SH600001' });
      const result = detectLimitMove(stock);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('limit_up');
      expect(result!.severity).toBe('critical');
    });

    it('should detect limit down', () => {
      const stock = mockStock({ price: 9.0, preClose: 10.0, code: 'SH600001' });
      const result = detectLimitMove(stock);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('limit_down');
    });

    it('should use 20% limit for ChiNext', () => {
      const stock = mockStock({ price: 11.9, preClose: 10.0, code: '300001' });
      const result = detectLimitMove(stock);
      expect(result).toBeNull(); // 19% is not limit for ChiNext (20%)
    });

    it('should detect 20% limit for ChiNext', () => {
      const stock = mockStock({ price: 12.0, preClose: 10.0, code: '300001' });
      const result = detectLimitMove(stock);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('limit_up');
    });

    it('should return null for normal movement', () => {
      const stock = mockStock({ price: 10.3, preClose: 10.0 });
      const result = detectLimitMove(stock);
      expect(result).toBeNull();
    });
  });

  describe('detectVolumeSurge', () => {
    it('should detect abnormal volume', () => {
      const stock = mockStock({ volume: 300000, avgVolume20: 80000 });
      const result = detectVolumeSurge(stock);
      expect(result.isAbnormal).toBe(true);
      expect(result.volumeRatio).toBeGreaterThan(3);
    });

    it('should classify up surge', () => {
      const stock = mockStock({ price: 10.5, preClose: 10.0, volume: 300000, avgVolume20: 80000 });
      const result = detectVolumeSurge(stock);
      expect(result.type).toBe('up_surge');
    });

    it('should classify down surge', () => {
      const stock = mockStock({ price: 9.5, preClose: 10.0, volume: 300000, avgVolume20: 80000 });
      const result = detectVolumeSurge(stock);
      expect(result.type).toBe('down_surge');
    });

    it('should classify neutral surge', () => {
      const stock = mockStock({ price: 10.1, preClose: 10.0, volume: 300000, avgVolume20: 80000 });
      const result = detectVolumeSurge(stock);
      expect(result.type).toBe('neutral_surge');
    });

    it('should not flag normal volume', () => {
      const stock = mockStock({ volume: 85000, avgVolume20: 80000 });
      const result = detectVolumeSurge(stock);
      expect(result.isAbnormal).toBe(false);
    });
  });

  describe('detectPriceMovement', () => {
    it('should detect spike', () => {
      const stock = mockStock({ price: 10.5 });
      const result = detectPriceMovement(stock, 10.0, 5);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('spike');
      expect(result!.priceChange).toBeCloseTo(5, 0);
    });

    it('should detect crash', () => {
      const stock = mockStock({ price: 9.5, low: 9.0 });
      const result = detectPriceMovement(stock, 10.0, 5);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('crash');
    });

    it('should return null for small movements', () => {
      const stock = mockStock({ price: 10.1 });
      const result = detectPriceMovement(stock, 10.0, 5);
      expect(result).toBeNull();
    });

    it('should include time window in result', () => {
      const stock = mockStock({ price: 10.5 });
      const result = detectPriceMovement(stock, 10.0, 10);
      expect(result!.timeWindow).toBe('10分钟');
    });
  });

  describe('detectTailMovement', () => {
    it('should detect tail movement near close', () => {
      const stock = mockStock({ time: '14:45', price: 10.8, avgVolume20: 80000 });
      const result = detectTailMovement(stock, 10.0, 20000);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('up');
    });

    it('should return null before 14:30', () => {
      const stock = mockStock({ time: '14:00', price: 10.8 });
      const result = detectTailMovement(stock, 10.0, 20000);
      expect(result).toBeNull();
    });

    it('should detect down tail movement', () => {
      const stock = mockStock({ time: '14:45', price: 9.5, avgVolume20: 80000 });
      const result = detectTailMovement(stock, 10.0, 20000);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('down');
    });
  });

  describe('scanAnomalies', () => {
    it('should scan all stocks for anomalies', () => {
      const stocks = [
        mockStock({ code: 'SH600001', price: 11.0, preClose: 10.0 }),
        mockStock({ code: 'SH600002', volume: 300000, avgVolume20: 80000 }),
        mockStock({ code: 'SH600003', price: 10.1 }),
      ];
      const alerts = scanAnomalies(stocks);
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should sort by severity', () => {
      const stocks = [
        mockStock({ code: 'SH600001', price: 11.0, preClose: 10.0 }), // critical
        mockStock({ code: 'SH600002', volume: 300000, avgVolume20: 80000 }), // medium/high
      ];
      const alerts = scanAnomalies(stocks);
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < alerts.length; i++) {
        expect(severityOrder[alerts[i - 1].severity]).toBeLessThanOrEqual(severityOrder[alerts[i].severity]);
      }
    });

    it('should return empty for normal stocks', () => {
      const stocks = [mockStock({ price: 10.1, preClose: 10.0, volume: 80000, avgVolume20: 80000, buy1: 10.09, sell1: 10.11 })];
      const alerts = scanAnomalies(stocks);
      expect(alerts).toHaveLength(0);
    });

    it('should handle empty stocks array', () => {
      const alerts = scanAnomalies([]);
      expect(alerts).toHaveLength(0);
    });

    it('should use previous prices for movement detection', () => {
      const stocks = [mockStock({ code: 'SH600001', price: 10.5 })];
      const prevPrices = new Map([['SH600001', 10.0]]);
      const alerts = scanAnomalies(stocks, prevPrices);
      expect(alerts.some(a => a.type === 'price_spike')).toBe(true);
    });
  });

  describe('summarizeAnomalies', () => {
    it('should count total alerts', () => {
      const stocks = [
        mockStock({ code: 'SH600001', price: 11.0, preClose: 10.0 }),
        mockStock({ code: 'SH600002', volume: 300000, avgVolume20: 80000 }),
      ];
      const alerts = scanAnomalies(stocks);
      const summary = summarizeAnomalies(alerts);
      expect(summary.total).toBe(alerts.length);
    });

    it('should group by type', () => {
      const stocks = [
        mockStock({ code: 'SH600001', price: 11.0, preClose: 10.0 }),
      ];
      const alerts = scanAnomalies(stocks);
      const summary = summarizeAnomalies(alerts);
      expect(Object.keys(summary.byType).length).toBeGreaterThan(0);
    });

    it('should group by severity', () => {
      const stocks = [
        mockStock({ code: 'SH600001', price: 11.0, preClose: 10.0 }),
      ];
      const alerts = scanAnomalies(stocks);
      const summary = summarizeAnomalies(alerts);
      expect(Object.keys(summary.bySeverity).length).toBeGreaterThan(0);
    });

    it('should extract critical list', () => {
      const stocks = [
        mockStock({ code: 'SH600001', price: 11.0, preClose: 10.0 }),
      ];
      const alerts = scanAnomalies(stocks);
      const summary = summarizeAnomalies(alerts);
      expect(summary.criticalList.length).toBeGreaterThan(0);
      summary.criticalList.forEach(a => {
        expect(['critical', 'high']).toContain(a.severity);
      });
    });

    it('should handle empty alerts', () => {
      const summary = summarizeAnomalies([]);
      expect(summary.total).toBe(0);
      expect(summary.criticalList).toHaveLength(0);
    });
  });
});
