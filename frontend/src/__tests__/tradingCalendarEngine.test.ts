import { describe, it, expect } from 'vitest';
import {
  isTradingDay,
  getTradingDayInfo,
  calculateExDividend,
  calculatePriceLimit,
  calculateSettlement,
  getTradingDays,
  countTradingDays,
  getNthTradingDay,
} from '../utils/tradingCalendarEngine';

describe('tradingCalendarEngine', () => {
  describe('isTradingDay', () => {
    it('should return false for weekends', () => {
      expect(isTradingDay('2025-03-08')).toBe(false); // Saturday
      expect(isTradingDay('2025-03-09')).toBe(false); // Sunday
    });

    it('should return true for weekdays', () => {
      expect(isTradingDay('2025-03-10')).toBe(true); // Monday
      expect(isTradingDay('2025-03-11')).toBe(true); // Tuesday
    });

    it('should return false for holidays', () => {
      expect(isTradingDay('2025-01-01')).toBe(false); // 元旦
    });
  });

  describe('getTradingDayInfo', () => {
    it('should return correct day info', () => {
      const info = getTradingDayInfo('2025-03-10');
      expect(info.isTradingDay).toBe(true);
      expect(info.dayOfWeek).toBe(1); // Monday
    });

    it('should find next trading day', () => {
      const info = getTradingDayInfo('2025-03-07'); // Friday
      expect(info.nextTradingDay).toBe('2025-03-10'); // Monday
    });

    it('should find prev trading day', () => {
      const info = getTradingDayInfo('2025-03-10'); // Monday
      expect(info.prevTradingDay).toBe('2025-03-07'); // Friday
    });

    it('should count trading days in year', () => {
      const info = getTradingDayInfo('2025-01-02');
      expect(info.tradingDayOfYear).toBeGreaterThan(0);
    });

    it('should include holiday name', () => {
      const info = getTradingDayInfo('2025-01-01');
      expect(info.holidayName).toBe('元旦');
    });
  });

  describe('calculateExDividend', () => {
    it('should calculate adjusted price for cash dividend', () => {
      const price = calculateExDividend({ prevClose: 10, cashDividend: 0.5, stockDividend: 0, capitalReserveTransfer: 0 });
      expect(price).toBe(9.5);
    });

    it('should calculate adjusted price for stock dividend', () => {
      const price = calculateExDividend({ prevClose: 20, cashDividend: 1, stockDividend: 0.5, capitalReserveTransfer: 0 });
      expect(price).toBeCloseTo(12.67, 1);
    });

    it('should handle combined dividend', () => {
      const price = calculateExDividend({ prevClose: 30, cashDividend: 2, stockDividend: 1, capitalReserveTransfer: 0.5 });
      expect(price).toBeLessThan(30);
    });
  });

  describe('calculatePriceLimit', () => {
    it('should calculate 10% limit for normal stocks', () => {
      const result = calculatePriceLimit({
        code: '000001', date: '2025-03-10', prevClose: 10,
        isST: false, is新股: false, is科创板: false, is北交所: false,
      });
      expect(result.upperLimit).toBe(11);
      expect(result.lowerLimit).toBe(9);
    });

    it('should calculate 5% limit for ST stocks', () => {
      const result = calculatePriceLimit({
        code: '000001', date: '2025-03-10', prevClose: 10,
        isST: true, is新股: false, is科创板: false, is北交所: false,
      });
      expect(result.upperLimit).toBe(10.5);
      expect(result.lowerLimit).toBe(9.5);
    });

    it('should calculate 20% limit for STAR market', () => {
      const result = calculatePriceLimit({
        code: '688001', date: '2025-03-10', prevClose: 100,
        isST: false, is新股: false, is科创板: true, is北交所: false,
      });
      expect(result.upperLimit).toBe(120);
      expect(result.lowerLimit).toBe(80);
    });
  });

  describe('calculateSettlement', () => {
    it('should calculate T+1 settlement', () => {
      const result = calculateSettlement('2025-03-10');
      expect(result.settlementDate).toBe('2025-03-11');
      expect(result.isT1).toBe(true);
    });

    it('should skip weekends', () => {
      const result = calculateSettlement('2025-03-07'); // Friday
      expect(result.settlementDate).toBe('2025-03-10'); // Monday
    });
  });

  describe('getTradingDays', () => {
    it('should list trading days in range', () => {
      const days = getTradingDays('2025-03-10', '2025-03-14');
      expect(days.length).toBe(5);
    });

    it('should exclude weekends', () => {
      const days = getTradingDays('2025-03-07', '2025-03-10');
      expect(days.length).toBe(2);
    });
  });

  describe('countTradingDays', () => {
    it('should count trading days', () => {
      const count = countTradingDays('2025-03-10', '2025-03-21');
      expect(count).toBe(10);
    });
  });

  describe('getNthTradingDay', () => {
    it('should get next N trading day', () => {
      const result = getNthTradingDay('2025-03-10', 5);
      expect(isTradingDay(result)).toBe(true);
      expect(result > '2025-03-10').toBe(true);
    });

    it('should get previous N trading day', () => {
      const result = getNthTradingDay('2025-03-14', -5);
      expect(isTradingDay(result)).toBe(true);
      expect(result < '2025-03-14').toBe(true);
    });
  });
});
