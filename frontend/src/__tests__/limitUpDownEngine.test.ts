import { describe, it, expect } from 'vitest';
import { analyzeLimitUpDown, sealStrengthScore, LimitData } from '../utils/limitUpDownEngine';

describe('涨跌停分析引擎', () => {
  const data: LimitData[] = [
    { stockCode: '000001', stockName: '平安银行', date: '2026-03-31', price: 15, limitPrice: 15.5, type: 'limit_up', sealVolume: 2000000, sealTime: '09:45', openCount: 0, prevLimitDays: 2, sector: '银行' },
    { stockCode: '000002', stockName: '万科A', date: '2026-03-31', price: 20, limitPrice: 21, type: 'limit_up', sealVolume: 1500000, sealTime: '10:30', openCount: 1, prevLimitDays: 0, sector: '地产' },
    { stockCode: '600001', stockName: '跌停股', date: '2026-03-31', price: 5, limitPrice: 4.5, type: 'limit_down', sealVolume: 500000, sealTime: '09:35', openCount: 0, prevLimitDays: 0, sector: '科技' },
    { stockCode: '600002', stockName: '跌停2', date: '2026-03-31', price: 8, limitPrice: 7.2, type: 'limit_down', sealVolume: 300000, sealTime: '14:00', openCount: 2, prevLimitDays: 1, sector: '消费' },
  ];

  describe('analyzeLimitUpDown', () => {
    it('should count limit up and down', () => {
      const result = analyzeLimitUpDown(data, '2026-03-31');
      expect(result.limitUpCount).toBe(2);
      expect(result.limitDownCount).toBe(2);
    });

    it('should calculate net limit', () => {
      const result = analyzeLimitUpDown(data, '2026-03-31');
      expect(result.netLimit).toBe(0);
    });

    it('should calculate seal strength', () => {
      const result = analyzeLimitUpDown(data, '2026-03-31');
      expect(result.sealStrength).toBe(0.5); // 1 of 2 sealed
    });

    it('should find top sealed stocks', () => {
      const result = analyzeLimitUpDown(data, '2026-03-31');
      expect(result.topSealed.length).toBe(2);
      expect(result.topSealed[0].sealVolume).toBeGreaterThanOrEqual(result.topSealed[1].sealVolume);
    });

    it('should find streak stocks', () => {
      const result = analyzeLimitUpDown(data, '2026-03-31');
      expect(result.streakStocks.length).toBeGreaterThan(0);
    });

    it('should analyze sector distribution', () => {
      const result = analyzeLimitUpDown(data, '2026-03-31');
      expect(result.sectorDistribution.length).toBeGreaterThan(0);
    });

    it('should determine market sentiment', () => {
      const result = analyzeLimitUpDown(data, '2026-03-31');
      expect(['extreme_fear', 'fear', 'neutral', 'greedy', 'extreme_greedy']).toContain(result.marketSentiment);
    });

    it('should handle empty data', () => {
      const result = analyzeLimitUpDown([], '2026-03-31');
      expect(result.limitUpCount).toBe(0);
      expect(result.limitDownCount).toBe(0);
    });
  });

  describe('sealStrengthScore', () => {
    it('should return 0-100 score', () => {
      const score = sealStrengthScore(data[0]);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should score sealed stocks higher', () => {
      const sealed = sealStrengthScore(data[0]);
      const opened = sealStrengthScore(data[1]);
      expect(sealed).toBeGreaterThan(opened);
    });
  });
});
