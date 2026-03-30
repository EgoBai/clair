import { describe, it, expect } from 'vitest';

// 交易日历逻辑测试
describe('Trading Calendar Logic', () => {
  // 周末检测
  describe('Weekend Detection', () => {
    const isWeekend = (dateStr: string): boolean => {
      const date = new Date(dateStr);
      const day = date.getDay();
      return day === 0 || day === 6;
    };

    it('should detect Saturday', () => {
      expect(isWeekend('2026-03-21')).toBe(true); // Saturday
    });

    it('should detect Sunday', () => {
      expect(isWeekend('2026-03-22')).toBe(true); // Sunday
    });

    it('should detect Monday as weekday', () => {
      expect(isWeekend('2026-03-23')).toBe(false); // Monday
    });

    it('should detect Friday as weekday', () => {
      expect(isWeekend('2026-03-20')).toBe(false); // Friday
    });

    it('should detect Wednesday as weekday', () => {
      expect(isWeekend('2026-03-25')).toBe(false); // Wednesday
    });
  });

  // 交易时段检测
  describe('Trading Session Detection', () => {
    const isTradingTime = (hour: number, minute: number): boolean => {
      const time = hour * 60 + minute;
      const morning = time >= 9 * 60 + 30 && time < 11 * 60 + 30;
      const afternoon = time >= 13 * 60 && time < 15 * 60;
      return morning || afternoon;
    };

    it('should detect morning session start', () => {
      expect(isTradingTime(9, 30)).toBe(true);
    });

    it('should detect morning session end', () => {
      expect(isTradingTime(11, 29)).toBe(true);
      expect(isTradingTime(11, 30)).toBe(false);
    });

    it('should detect afternoon session start', () => {
      expect(isTradingTime(13, 0)).toBe(true);
    });

    it('should detect afternoon session end', () => {
      expect(isTradingTime(14, 59)).toBe(true);
      expect(isTradingTime(15, 0)).toBe(false);
    });

    it('should detect lunch break as non-trading', () => {
      expect(isTradingTime(12, 0)).toBe(false);
    });

    it('should detect pre-market as non-trading', () => {
      expect(isTradingTime(9, 0)).toBe(false);
    });

    it('should detect after-hours as non-trading', () => {
      expect(isTradingTime(16, 0)).toBe(false);
    });
  });

  // 下一交易日
  describe('Next Trading Day', () => {
    const nextTradingDay = (dateStr: string): string => {
      const date = new Date(dateStr);
      do {
        date.setDate(date.getDate() + 1);
      } while (date.getDay() === 0 || date.getDay() === 6);
      return date.toISOString().split('T')[0];
    };

    it('should find next trading day from Friday', () => {
      expect(nextTradingDay('2026-03-20')).toBe('2026-03-23');
    });

    it('should find next trading day from Saturday', () => {
      expect(nextTradingDay('2026-03-21')).toBe('2026-03-23');
    });

    it('should find next trading day from weekday', () => {
      expect(nextTradingDay('2026-03-23')).toBe('2026-03-24');
    });
  });

  // 上一交易日
  describe('Previous Trading Day', () => {
    const prevTradingDay = (dateStr: string): string => {
      const date = new Date(dateStr);
      do {
        date.setDate(date.getDate() - 1);
      } while (date.getDay() === 0 || date.getDay() === 6);
      return date.toISOString().split('T')[0];
    };

    it('should find prev trading day from Monday', () => {
      expect(prevTradingDay('2026-03-23')).toBe('2026-03-20');
    });

    it('should find prev trading day from Sunday', () => {
      expect(prevTradingDay('2026-03-22')).toBe('2026-03-20');
    });
  });

  // 交易日计数
  describe('Trading Day Count', () => {
    const countTradingDays = (start: string, end: string): number => {
      let count = 0;
      const current = new Date(start);
      const endDate = new Date(end);
      while (current <= endDate) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) count++;
        current.setDate(current.getDate() + 1);
      }
      return count;
    };

    it('should count trading days in a week', () => {
      // Mon-Fri = 5 trading days
      expect(countTradingDays('2026-03-23', '2026-03-27')).toBe(5);
    });

    it('should count trading days across weekend', () => {
      // Fri to Mon = 2 trading days
      expect(countTradingDays('2026-03-20', '2026-03-23')).toBe(2);
    });

    it('should count 0 for weekend only', () => {
      expect(countTradingDays('2026-03-21', '2026-03-22')).toBe(0);
    });

    it('should count single trading day', () => {
      expect(countTradingDays('2026-03-24', '2026-03-24')).toBe(1);
    });
  });

  // 交易月份
  describe('Trading Month', () => {
    const getTradingDaysInMonth = (year: number, month: number): number => {
      let count = 0;
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dow = date.getDay();
        if (dow !== 0 && dow !== 6) count++;
      }
      return count;
    };

    it('should have ~22 trading days in a typical month', () => {
      const days = getTradingDaysInMonth(2026, 3);
      expect(days).toBeGreaterThanOrEqual(20);
      expect(days).toBeLessThanOrEqual(23);
    });

    it('should have ~20 trading days in Feb', () => {
      const days = getTradingDaysInMonth(2026, 2);
      expect(days).toBeGreaterThanOrEqual(19);
      expect(days).toBeLessThanOrEqual(21);
    });
  });

  // 季度日期
  describe('Quarter Dates', () => {
    const getQuarter = (month: number): number => {
      return Math.ceil(month / 3);
    };

    it('should identify Q1', () => {
      expect(getQuarter(2)).toBe(1);
    });

    it('should identify Q2', () => {
      expect(getQuarter(5)).toBe(2);
    });

    it('should identify Q3', () => {
      expect(getQuarter(8)).toBe(3);
    });

    it('should identify Q4', () => {
      expect(getQuarter(11)).toBe(4);
    });
  });

  // 盘前盘后
  describe('Pre/Post Market', () => {
    const getSession = (hour: number, minute: number): string => {
      const time = hour * 60 + minute;
      if (time < 9 * 60 + 15) return 'before';
      if (time < 9 * 60 + 30) return 'auction';
      if (time < 11 * 60 + 30) return 'morning';
      if (time < 13 * 60) return 'lunch';
      if (time < 15 * 60) return 'afternoon';
      if (time < 15 * 60 + 5) return 'closing';
      return 'after';
    };

    it('should identify pre-market', () => {
      expect(getSession(9, 0)).toBe('before');
    });

    it('should identify auction period', () => {
      expect(getSession(9, 20)).toBe('auction');
    });

    it('should identify morning session', () => {
      expect(getSession(10, 0)).toBe('morning');
    });

    it('should identify lunch break', () => {
      expect(getSession(12, 0)).toBe('lunch');
    });

    it('should identify afternoon session', () => {
      expect(getSession(14, 0)).toBe('afternoon');
    });

    it('should identify closing auction', () => {
      expect(getSession(15, 2)).toBe('closing');
    });

    it('should identify after-hours', () => {
      expect(getSession(15, 30)).toBe('after');
    });
  });
});
