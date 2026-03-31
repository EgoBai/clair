import { describe, it, expect } from 'vitest';
import { analyzeSecuritiesLending, LendingData } from '../utils/securitiesLendingEngine';

describe('转融通分析引擎', () => {
  const data: LendingData[] = [
    { date: '2026-03-25', stockCode: '000001', stockName: '平安银行', lentVolume: 100000, returnedVolume: 50000, lendingBalance: 500000, lendingRate: 0.08, availableVolume: 1000000 },
    { date: '2026-03-26', stockCode: '000001', stockName: '平安银行', lentVolume: 120000, returnedVolume: 60000, lendingBalance: 560000, lendingRate: 0.09, availableVolume: 1000000 },
    { date: '2026-03-27', stockCode: '000001', stockName: '平安银行', lentVolume: 80000, returnedVolume: 100000, lendingBalance: 540000, lendingRate: 0.07, availableVolume: 1000000 },
    { date: '2026-03-28', stockCode: '000001', stockName: '平安银行', lentVolume: 150000, returnedVolume: 70000, lendingBalance: 620000, lendingRate: 0.10, availableVolume: 1000000 },
    { date: '2026-03-31', stockCode: '000001', stockName: '平安银行', lentVolume: 130000, returnedVolume: 80000, lendingBalance: 670000, lendingRate: 0.09, availableVolume: 1000000 },
  ];

  describe('analyzeSecuritiesLending', () => {
    it('should calculate current balance', () => {
      const result = analyzeSecuritiesLending(data);
      expect(result.currentBalance).toBe(670000);
    });

    it('should calculate balance change', () => {
      const result = analyzeSecuritiesLending(data);
      expect(result.balanceChange).toBe(50000);
    });

    it('should calculate utilization rate', () => {
      const result = analyzeSecuritiesLending(data);
      expect(result.utilizationRate).toBeCloseTo(0.67, 1);
    });

    it('should determine trend', () => {
      const result = analyzeSecuritiesLending(data);
      expect(['increasing', 'decreasing', 'stable']).toContain(result.trend);
    });

    it('should classify supply pressure', () => {
      const result = analyzeSecuritiesLending(data);
      expect(['low', 'moderate', 'high']).toContain(result.supplyPressure);
    });

    it('should generate signal', () => {
      const result = analyzeSecuritiesLending(data);
      expect(['bearish', 'neutral', 'bullish']).toContain(result.signal);
    });

    it('should handle empty data', () => {
      const result = analyzeSecuritiesLending([]);
      expect(result.currentBalance).toBe(0);
      expect(result.signal).toBe('neutral');
    });
  });
});
