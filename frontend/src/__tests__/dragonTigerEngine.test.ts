import { describe, it, expect } from 'vitest';
import { analyzeDragonTiger, DragonTigerEntry } from '../utils/dragonTigerEngine';

describe('龙虎榜分析引擎', () => {
  const entries: DragonTigerEntry[] = [
    { date: '2026-03-31', stockCode: '000001', stockName: '平安银行', type: 'buy', rank: 1, seat: '机构专用', amount: 50000000, is机构: true },
    { date: '2026-03-31', stockCode: '000001', stockName: '平安银行', type: 'sell', rank: 1, seat: '游资营业部', amount: 30000000, is机构: false },
    { date: '2026-03-31', stockCode: '000002', stockName: '万科A', type: 'buy', rank: 1, seat: '机构专用', amount: 40000000, is机构: true },
    { date: '2026-03-31', stockCode: '000002', stockName: '万科A', type: 'sell', rank: 2, seat: '游资营业部', amount: 25000000, is机构: false },
    { date: '2026-03-31', stockCode: '000001', stockName: '平安银行', type: 'buy', rank: 2, seat: '另一游资', amount: 20000000, is机构: false },
  ];

  describe('analyzeDragonTiger', () => {
    it('should calculate net inflow', () => {
      const result = analyzeDragonTiger(entries);
      expect(result.netInflow).toBeDefined();
    });

    it('should separate institution and hot money', () => {
      const result = analyzeDragonTiger(entries);
      expect(result.institutionNetFlow).toBeDefined();
      expect(result.hotmoneyNetFlow).toBeDefined();
    });

    it('should build seat profiles', () => {
      const result = analyzeDragonTiger(entries);
      expect(result.seatProfiles.length).toBeGreaterThan(0);
      result.seatProfiles.forEach(p => {
        expect(p.seat).toBeDefined();
        expect(p.totalBuy).toBeGreaterThanOrEqual(0);
      });
    });

    it('should identify top seats', () => {
      const result = analyzeDragonTiger(entries);
      expect(result.topSeats.length).toBeLessThanOrEqual(10);
    });

    it('should generate signals', () => {
      const result = analyzeDragonTiger(entries);
      expect(Array.isArray(result.signals)).toBe(true);
    });

    it('should classify seat styles', () => {
      const result = analyzeDragonTiger(entries);
      result.seatProfiles.forEach(p => {
        expect(['机构', '游资', '混合', '未知']).toContain(p.style);
      });
    });

    it('should handle empty input', () => {
      const result = analyzeDragonTiger([]);
      expect(result.seatProfiles.length).toBe(0);
      expect(result.netInflow).toBe(0);
    });
  });
});
