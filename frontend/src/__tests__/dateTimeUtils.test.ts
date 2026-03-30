import { describe, it, expect } from 'vitest';

// Date and time utility tests
describe('Date & Time Utilities', () => {
  // Trading day calculation
  describe('Trading Day Logic', () => {
    function isWeekend(date: Date): boolean {
      const day = date.getDay();
      return day === 0 || day === 6;
    }

    function isTradingDay(date: Date): boolean {
      return !isWeekend(date);
      // Note: holiday check would need external data
    }

    function nextTradingDay(date: Date): Date {
      const next = new Date(date);
      do {
        next.setDate(next.getDate() + 1);
      } while (!isTradingDay(next));
      return next;
    }

    function prevTradingDay(date: Date): Date {
      const prev = new Date(date);
      do {
        prev.setDate(prev.getDate() - 1);
      } while (!isTradingDay(prev));
      return prev;
    }

    function tradingDaysBetween(start: Date, end: Date): number {
      let count = 0;
      const current = new Date(start);
      while (current <= end) {
        if (isTradingDay(current)) count++;
        current.setDate(current.getDate() + 1);
      }
      return count;
    }

    it('should identify weekends', () => {
      // 2024-01-06 is Saturday
      expect(isWeekend(new Date(2024, 0, 6))).toBe(true);
      // 2024-01-07 is Sunday
      expect(isWeekend(new Date(2024, 0, 7))).toBe(true);
      // 2024-01-05 is Friday
      expect(isWeekend(new Date(2024, 0, 5))).toBe(false);
    });

    it('should find next trading day', () => {
      // Friday -> Monday
      const friday = new Date(2024, 0, 5);
      const next = nextTradingDay(friday);
      expect(next.getDay()).toBe(1); // Monday
    });

    it('should find previous trading day', () => {
      // Monday -> Friday
      const monday = new Date(2024, 0, 8);
      const prev = prevTradingDay(monday);
      expect(prev.getDay()).toBe(5); // Friday
    });

    it('should count trading days in a week', () => {
      const mon = new Date(2024, 0, 8);
      const fri = new Date(2024, 0, 12);
      expect(tradingDaysBetween(mon, fri)).toBe(5);
    });

    it('should count trading days across weekends', () => {
      const fri = new Date(2024, 0, 5);
      const mon = new Date(2024, 0, 8);
      expect(tradingDaysBetween(fri, mon)).toBe(2);
    });

    it('should handle single day', () => {
      const wed = new Date(2024, 0, 10);
      expect(tradingDaysBetween(wed, wed)).toBe(1);
    });

    it('should handle weekend as single day', () => {
      const sat = new Date(2024, 0, 6);
      expect(tradingDaysBetween(sat, sat)).toBe(0);
    });
  });

  // Time formatting
  describe('Time Formatting', () => {
    function formatRelativeTime(timestamp: number, now: number): string {
      const diff = now - timestamp;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (seconds < 60) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 30) return `${days}天前`;
      if (days < 365) return `${Math.floor(days / 30)}个月前`;
      return `${Math.floor(days / 365)}年前`;
    }

    it('should return 刚刚 for recent', () => {
      expect(formatRelativeTime(0, 30000)).toBe('刚刚');
    });

    it('should return minutes', () => {
      expect(formatRelativeTime(0, 5 * 60 * 1000)).toBe('5分钟前');
    });

    it('should return hours', () => {
      expect(formatRelativeTime(0, 3 * 3600 * 1000)).toBe('3小时前');
    });

    it('should return days', () => {
      expect(formatRelativeTime(0, 5 * 86400 * 1000)).toBe('5天前');
    });

    it('should return months', () => {
      expect(formatRelativeTime(0, 45 * 86400 * 1000)).toBe('1个月前');
    });

    it('should return years', () => {
      expect(formatRelativeTime(0, 400 * 86400 * 1000)).toBe('1年前');
    });
  });

  // Date range utilities
  describe('Date Range', () => {
    interface DateRange { start: Date; end: Date; }

    function isOverlapping(a: DateRange, b: DateRange): boolean {
      return a.start <= b.end && b.start <= a.end;
    }

    function rangeDays(range: DateRange): number {
      return Math.ceil((range.end.getTime() - range.start.getTime()) / 86400000);
    }

    function clampDate(date: Date, range: DateRange): Date {
      if (date < range.start) return range.start;
      if (date > range.end) return range.end;
      return date;
    }

    it('should detect overlapping ranges', () => {
      const a = { start: new Date(2024, 0, 1), end: new Date(2024, 0, 10) };
      const b = { start: new Date(2024, 0, 5), end: new Date(2024, 0, 15) };
      expect(isOverlapping(a, b)).toBe(true);
    });

    it('should detect non-overlapping ranges', () => {
      const a = { start: new Date(2024, 0, 1), end: new Date(2024, 0, 5) };
      const b = { start: new Date(2024, 0, 10), end: new Date(2024, 0, 15) };
      expect(isOverlapping(a, b)).toBe(false);
    });

    it('should detect adjacent ranges as overlapping', () => {
      const a = { start: new Date(2024, 0, 1), end: new Date(2024, 0, 5) };
      const b = { start: new Date(2024, 0, 5), end: new Date(2024, 0, 10) };
      expect(isOverlapping(a, b)).toBe(true);
    });

    it('should calculate range days', () => {
      const range = { start: new Date(2024, 0, 1), end: new Date(2024, 0, 11) };
      expect(rangeDays(range)).toBe(10);
    });

    it('should clamp date to range', () => {
      const range = { start: new Date(2024, 0, 1), end: new Date(2024, 0, 31) };
      expect(clampDate(new Date(2023, 11, 15), range)).toEqual(range.start);
      expect(clampDate(new Date(2024, 0, 15), range)).toEqual(new Date(2024, 0, 15));
      expect(clampDate(new Date(2024, 1, 1), range)).toEqual(range.end);
    });
  });

  // Market hours
  describe('Market Hours', () => {
    function isMarketOpen(date: Date): boolean {
      const day = date.getDay();
      if (day === 0 || day === 6) return false;
      const hour = date.getHours();
      const minute = date.getMinutes();
      const totalMin = hour * 60 + minute;
      // A股: 9:30-11:30, 13:00-15:00
      return (totalMin >= 570 && totalMin <= 690) || (totalMin >= 780 && totalMin <= 900);
    }

    it('should detect morning session', () => {
      const date = new Date(2024, 0, 8, 10, 0); // Monday 10:00
      expect(isMarketOpen(date)).toBe(true);
    });

    it('should detect afternoon session', () => {
      const date = new Date(2024, 0, 8, 14, 0); // Monday 14:00
      expect(isMarketOpen(date)).toBe(true);
    });

    it('should detect lunch break as closed', () => {
      const date = new Date(2024, 0, 8, 12, 0); // Monday 12:00
      expect(isMarketOpen(date)).toBe(false);
    });

    it('should detect weekend as closed', () => {
      const date = new Date(2024, 0, 6, 10, 0); // Saturday 10:00
      expect(isMarketOpen(date)).toBe(false);
    });

    it('should detect before open as closed', () => {
      const date = new Date(2024, 0, 8, 9, 0); // Monday 9:00
      expect(isMarketOpen(date)).toBe(false);
    });

    it('should detect after close as closed', () => {
      const date = new Date(2024, 0, 8, 15, 30); // Monday 15:30
      expect(isMarketOpen(date)).toBe(false);
    });

    it('should detect exact open time', () => {
      const date = new Date(2024, 0, 8, 9, 30); // Monday 9:30
      expect(isMarketOpen(date)).toBe(true);
    });

    it('should detect exact close time', () => {
      const date = new Date(2024, 0, 8, 15, 0); // Monday 15:00
      expect(isMarketOpen(date)).toBe(true);
    });
  });
});
