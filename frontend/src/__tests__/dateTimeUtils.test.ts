/**
 * 影子测试迁移（批次 12）
 *
 * 旧文件自带 isWeekend/isTradingDay/nextTradingDay/prevTradingDay/
 * tradingDaysBetween/formatRelativeTime/isMarketOpen 等本地副本，断言的是副本。
 * 现已 import 生产实现。
 *
 * 已绑定生产实现：
 * - ../utils/tradingCalendarEngine.ts: isTradingDay / getTradingDayInfo / countTradingDays
 * - ../utils/marketCalendarEngine.ts: MarketCalendar（isWeekend / isMarketOpen）
 * - ../i18n/i18nManager.ts: formatRelativeTime
 *
 * 旧断言错在哪（旧副本与生产行为不一致）：
 *
 * | 旧断言 | 生产输出 | 依据 |
 * | --- | --- | --- |
 * | 30 秒前 === '刚刚' | '30秒钟前' | i18nManager.ts:176 用 Intl.RelativeTimeFormat，不足 1 分钟仍走 second 单元 |
 * | 45 天前 === '1个月前' | '上个月' | Math.round(-1.5) = -1 个月；numeric:'auto' 渲染为「上个月」 |
 * | 400 天前 === '1年前' | '去年' | Math.round(-400/365) = -1 年；numeric:'auto' 渲染为「去年」 |
 * | isTradingDay(Date) 仅判周末 | isTradingDay(dateStr) 字符串 + 节假日表 | tradingCalendarEngine.ts:62 |
 * | next/prev 返回 Date 并断言 getDay() | getTradingDayInfo 返回 nextTradingDay/prevTradingDay 字符串 | :70 |
 * | tradingDaysBetween 返回计数 | countTradingDays 返回闭区间计数 | :191；getTradingDays 返回交易日数组 |
 *
 * 未迁移——生产无对应实现：
 * - Date Range（isOverlapping/rangeDays/clampDate）：生产无同名导出；
 *   globalCorrelationEngine.isOverlappingTradingHours 是跨市场交易时段重叠，语义不同。
 *
 * 发现的生产缺口（只报告不修）：
 * - tradingCalendarEngine.ts:48 注释称「2025-2026」，但 HOLIDAYS 只有 2025 年 13 组，
 *   2026 年无任何条目
 * - isTradingDay 用 new Date(dateStr).getDay()（本地时区），UTC 负偏移时区会错一天；
 *   getTradingDays 内部 formatDate 用 toISOString()，同样有跨时区风险
 * - i18nManager 45 天取整为「上个月」，与其他「n 个月前」口径不一致
 * - MarketCalendar 除自身测试外无生产调用方（死代码），
 *   但 isMarketOpen 是仓库唯一 A 股交易时段实现，故仍绑定
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime } from '../i18n/i18nManager';
import { MarketCalendar } from '../utils/marketCalendarEngine';
import { countTradingDays, getTradingDayInfo, isTradingDay } from '../utils/tradingCalendarEngine';

// Date and time utility tests
describe('Date & Time Utilities', () => {
  // Trading day calculation
  describe('Trading Day Logic', () => {
    const calendar = new MarketCalendar();

    it('should identify weekends', () => {
      // 2024-01-06 is Saturday, 2024-01-07 is Sunday, 2024-01-05 is Friday
      expect(calendar.isWeekend('2024-01-06')).toBe(true);
      expect(calendar.isWeekend('2024-01-07')).toBe(true);
      expect(calendar.isWeekend('2024-01-05')).toBe(false);
      // 前端 tradingCalendarEngine 无 isWeekend 导出，用同一引擎的 isTradingDay 复核
      expect(isTradingDay('2024-01-06')).toBe(false);
      expect(isTradingDay('2024-01-07')).toBe(false);
      expect(isTradingDay('2024-01-05')).toBe(true);
    });

    it('should find next trading day', () => {
      // Friday -> Monday
      const info = getTradingDayInfo('2024-01-05');
      expect(info.nextTradingDay).toBe('2024-01-08');
      expect(new Date(info.nextTradingDay + 'T00:00:00').getDay()).toBe(1); // Monday
    });

    it('should find previous trading day', () => {
      // Monday -> Friday
      const info = getTradingDayInfo('2024-01-08');
      expect(info.prevTradingDay).toBe('2024-01-05');
      expect(new Date(info.prevTradingDay + 'T00:00:00').getDay()).toBe(5); // Friday
    });

    it('should count trading days in a week', () => {
      expect(countTradingDays('2024-01-08', '2024-01-12')).toBe(5);
    });

    it('should count trading days across weekends', () => {
      expect(countTradingDays('2024-01-05', '2024-01-08')).toBe(2);
    });

    it('should handle single day', () => {
      expect(countTradingDays('2024-01-10', '2024-01-10')).toBe(1);
    });

    it('should handle weekend as single day', () => {
      expect(countTradingDays('2024-01-06', '2024-01-06')).toBe(0);
    });
  });

  // Time formatting
  describe('Time Formatting', () => {
    // 2024-06-15T12:00:00Z
    const NOW = Date.parse('2024-06-15T12:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return 刚刚 for recent', () => {
      // 生产按 second 单元输出，不足 1 分钟不再是「刚刚」
      expect(formatRelativeTime(NOW - 30000)).toBe('30秒钟前');
    });

    it('should return minutes', () => {
      expect(formatRelativeTime(NOW - 5 * 60 * 1000)).toBe('5分钟前');
    });

    it('should return hours', () => {
      expect(formatRelativeTime(NOW - 3 * 3600 * 1000)).toBe('3小时前');
    });

    it('should return days', () => {
      expect(formatRelativeTime(NOW - 5 * 86400 * 1000)).toBe('5天前');
    });

    it('should return months', () => {
      // 45 天 / 30 = 1.5，Math.round(-1.5) = -1，numeric:'auto' 渲染为「上个月」
      expect(formatRelativeTime(NOW - 45 * 86400 * 1000)).toBe('上个月');
    });

    it('should return years', () => {
      // 400 天 / 365 = 1.0959，取整为 -1 年，numeric:'auto' 渲染为「去年」
      expect(formatRelativeTime(NOW - 400 * 86400 * 1000)).toBe('去年');
    });
  });

  // Date range utilities
  // 未迁移——生产无对应实现（globalCorrelationEngine.isOverlappingTradingHours
  // 是交易时段重叠，语义不同），保留本地 helper
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
    const calendar = new MarketCalendar();

    it('should detect morning session', () => {
      const date = new Date(2024, 0, 8, 10, 0); // Monday 10:00
      expect(calendar.isMarketOpen(date)).toBe(true);
    });

    it('should detect afternoon session', () => {
      const date = new Date(2024, 0, 8, 14, 0); // Monday 14:00
      expect(calendar.isMarketOpen(date)).toBe(true);
    });

    it('should detect lunch break as closed', () => {
      const date = new Date(2024, 0, 8, 12, 0); // Monday 12:00
      expect(calendar.isMarketOpen(date)).toBe(false);
    });

    it('should detect weekend as closed', () => {
      const date = new Date(2024, 0, 6, 10, 0); // Saturday 10:00
      expect(calendar.isMarketOpen(date)).toBe(false);
    });

    it('should detect before open as closed', () => {
      const date = new Date(2024, 0, 8, 9, 0); // Monday 9:00
      expect(calendar.isMarketOpen(date)).toBe(false);
    });

    it('should detect after close as closed', () => {
      const date = new Date(2024, 0, 8, 15, 30); // Monday 15:30
      expect(calendar.isMarketOpen(date)).toBe(false);
    });

    it('should detect exact open time', () => {
      const date = new Date(2024, 0, 8, 9, 30); // Monday 9:30
      expect(calendar.isMarketOpen(date)).toBe(true);
    });

    it('should detect exact close time', () => {
      const date = new Date(2024, 0, 8, 15, 0); // Monday 15:00
      expect(calendar.isMarketOpen(date)).toBe(true);
    });
  });
});
