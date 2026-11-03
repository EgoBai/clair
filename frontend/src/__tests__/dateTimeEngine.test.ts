/**
 * 批次 26a：影子测试迁移 —— 日期与时间处理引擎
 *
 * 已绑定生产实现：
 * - formatters.formatDate（默认 yyyy-MM-dd；仅识别小写 yyyy/MM/dd 与大写 HH/mm/ss）
 * - i18nManager.formatRelativeTime（Intl.RelativeTimeFormat，按最大单位取整）
 * - tradingCalendarEngine.isTradingDay / getTradingDayInfo / countTradingDays / getNthTradingDay（含节假日表）
 *
 * 未迁移（生产无对应导出）：getQuarter / daysSinceYearStart / endOfMonth / dateRange / parseDate /
 * daysDiff / isSameDay / timestampToDate，保留内联 helper。
 *
 * 旧断言订正（旧值 -> 生产值）：
 * - 旧 formatDate 认大写 'YYYY-MM-DD'；生产只识别小写 yyyy-MM-dd，用例改用 'yyyy-MM-dd HH:mm:ss'
 *   （frontend/src/utils/formatters.ts:84-90）。
 * - 相对时间 '30秒前' -> '30秒钟前'；'9天前' -> '上周'（frontend/src/i18n/i18nManager.ts:184-198
 *   先命中最大单位，9 天落入 week 并四舍五入为 -1）。
 * - 交易日旧 helper 只判周末，2025-10-01 会返回 true；生产依节假日表返回 false
 *   （frontend/src/utils/tradingCalendarEngine.ts:49-68）。
 * - 添加工作日旧 helper 只跳周末；生产 getNthTradingDay 同时跳节假日并返回 'YYYY-MM-DD' 字符串
 *   （frontend/src/utils/tradingCalendarEngine.ts:195-205）。
 *
 * 生产缺口（只记录不修）：HOLIDAYS 仅 2025 年，注释称含 2026 但无 2026 条目
 * （tradingCalendarEngine.ts:48-58）；getTradingDays 内部用 toISOString 格式化，负时区有错日风险
 * （tradingCalendarEngine.ts:207-209）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatDate } from '../utils/formatters';
import { formatRelativeTime } from '../i18n/i18nManager';
import {
  countTradingDays,
  getNthTradingDay,
  getTradingDayInfo,
  isTradingDay,
} from '../utils/tradingCalendarEngine';

// ===== 日期与时间处理引擎 =====
describe('Date & Time Processing Engine', () => {
  describe('日期格式化（formatters.formatDate）', () => {
    it('默认格式', () => {
      const d = new Date(2026, 2, 15);
      expect(formatDate(d)).toBe('2026-03-15');
    });

    it('含时间', () => {
      const d = new Date(2026, 0, 1, 9, 30, 45);
      expect(formatDate(d, 'yyyy-MM-dd HH:mm:ss')).toBe('2026-01-01 09:30:45');
    });

    it('单数月补零', () => {
      const d = new Date(2026, 0, 5);
      expect(formatDate(d)).toBe('2026-01-05');
    });

    it('无效输入返回占位符', () => {
      expect(formatDate('not-a-date')).toBe('--');
      expect(formatDate(null)).toBe('--');
      expect(formatDate(undefined)).toBe('--');
    });
  });

  describe('相对时间（i18nManager.formatRelativeTime）', () => {
    const NOW = new Date(2026, 0, 10, 12, 0, 0).getTime();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('几秒前', () => {
      expect(formatRelativeTime(NOW - 30 * 1000)).toBe('30秒钟前');
    });

    it('几分钟前', () => {
      expect(formatRelativeTime(NOW - 30 * 60 * 1000)).toBe('30分钟前');
    });

    it('几小时前', () => {
      expect(formatRelativeTime(NOW - 3 * 60 * 60 * 1000)).toBe('3小时前');
    });

    it('几天前', () => {
      // 9 天超过一周阈值，生产按最大单位取整为 week -> '上周'
      expect(formatRelativeTime(NOW - 9 * 24 * 60 * 60 * 1000)).toBe('上周');
    });

    it('几个月前', () => {
      expect(formatRelativeTime(NOW - 92 * 24 * 60 * 60 * 1000)).toBe('3个月前');
    });
  });

  describe('交易日判断（tradingCalendarEngine.isTradingDay）', () => {
    it('周一到周五是交易日', () => {
      // 2026-03-23 is Monday
      expect(isTradingDay('2026-03-23')).toBe(true);
      expect(isTradingDay('2026-03-27')).toBe(true); // Friday
    });

    it('周六周日不是交易日', () => {
      expect(isTradingDay('2026-03-28')).toBe(false); // Saturday
      expect(isTradingDay('2026-03-29')).toBe(false); // Sunday
    });

    it('法定节假日不是交易日', () => {
      expect(isTradingDay('2025-10-01')).toBe(false);
      expect(getTradingDayInfo('2025-10-01').holidayName).toBe('国庆节');
    });
  });

  describe('交易日计数（tradingCalendarEngine.countTradingDays）', () => {
    it('整周', () => {
      // Mon to Fri = 5 trading days
      expect(countTradingDays('2026-03-23', '2026-03-27')).toBe(5);
    });

    it('跨周末', () => {
      // Fri to Mon = 2 trading days
      expect(countTradingDays('2026-03-27', '2026-03-30')).toBe(2);
    });

    it('同一天', () => {
      expect(countTradingDays('2026-03-23', '2026-03-23')).toBe(1);
    });
  });

  // ===== 以下能力生产无对应导出，保留内联 helper =====
  // 未迁移：生产无 getQuarter 导出（仅 insiderTradingEngine.ts:114 内联季度字符串）
  const getQuarter = (date: Date): number => Math.floor(date.getMonth() / 3) + 1;

  // 未迁移：生产无 daysSinceYearStart 导出
  const daysSinceYearStart = (date: Date): number => {
    const yearStart = new Date(date.getFullYear(), 0, 1);
    return Math.floor((date.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  };

  // 未迁移：生产无 endOfMonth 导出（marketCalendarEngine.ts:189 只有 getTradingDaysInMonth 内部 lastDay）
  const endOfMonth = (year: number, month: number): Date => new Date(year, month + 1, 0);

  // 未迁移：生产无 dateRange 导出
  const dateRange = (start: Date, end: Date, step: number = 1): Date[] => {
    const dates: Date[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + step);
    }
    return dates;
  };

  // 未迁移：生产无 parseDate 导出
  const parseDate = (str: string): Date | null => {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  // 未迁移：生产无 daysDiff 导出
  const daysDiff = (a: Date, b: Date): number => {
    return Math.floor(Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
  };

  // 未迁移：生产无 isSameDay 导出
  const isSameDay = (a: Date, b: Date): boolean => {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

  // 未迁移：生产无 timestampToDate 导出
  const timestampToDate = (ts: number, unit: 's' | 'ms' = 'ms'): Date => {
    return new Date(unit === 's' ? ts * 1000 : ts);
  };

  describe('季度判断', () => {
    it('Q1', () => { expect(getQuarter(new Date(2026, 0, 1))).toBe(1); });
    it('Q2', () => { expect(getQuarter(new Date(2026, 3, 1))).toBe(2); });
    it('Q3', () => { expect(getQuarter(new Date(2026, 6, 1))).toBe(3); });
    it('Q4', () => { expect(getQuarter(new Date(2026, 9, 1))).toBe(4); });
  });

  describe('年初至今天数', () => {
    it('1月1日是第1天', () => {
      expect(daysSinceYearStart(new Date(2026, 0, 1))).toBe(1);
    });

    it('1月2日是第2天', () => {
      expect(daysSinceYearStart(new Date(2026, 0, 2))).toBe(2);
    });

    it('3月1日(非闰年)是第60天', () => {
      expect(daysSinceYearStart(new Date(2026, 2, 1))).toBe(60);
    });
  });

  describe('月末日期', () => {
    it('1月31日', () => {
      const eom = endOfMonth(2026, 0);
      expect(eom.getDate()).toBe(31);
    });

    it('2月(非闰年)28日', () => {
      const eom = endOfMonth(2026, 1);
      expect(eom.getDate()).toBe(28);
    });

    it('2月(闰年)29日', () => {
      const eom = endOfMonth(2024, 1);
      expect(eom.getDate()).toBe(29);
    });

    it('4月30日', () => {
      const eom = endOfMonth(2026, 3);
      expect(eom.getDate()).toBe(30);
    });
  });

  describe('日期范围', () => {
    it('生成5天', () => {
      const dates = dateRange(new Date(2026, 0, 1), new Date(2026, 0, 5));
      expect(dates.length).toBe(5);
    });

    it('步长为2', () => {
      const dates = dateRange(new Date(2026, 0, 1), new Date(2026, 0, 7), 2);
      expect(dates.length).toBe(4);
    });

    it('同一天返回1个', () => {
      const dates = dateRange(new Date(2026, 0, 1), new Date(2026, 0, 1));
      expect(dates.length).toBe(1);
    });
  });

  describe('解析日期', () => {
    it('有效日期', () => {
      expect(parseDate('2026-03-15')).not.toBeNull();
    });

    it('无效日期', () => {
      expect(parseDate('not-a-date')).toBeNull();
    });

    it('空字符串', () => {
      expect(parseDate('')).toBeNull();
    });
  });

  describe('日期差', () => {
    it('相差5天', () => {
      expect(daysDiff(new Date(2026, 0, 1), new Date(2026, 0, 6))).toBe(5);
    });

    it('同一天', () => {
      expect(daysDiff(new Date(2026, 0, 1), new Date(2026, 0, 1))).toBe(0);
    });

    it('反向也正确', () => {
      expect(daysDiff(new Date(2026, 0, 6), new Date(2026, 0, 1))).toBe(5);
    });
  });

  describe('同一天判断', () => {
    it('同一日期不同时间', () => {
      expect(isSameDay(new Date(2026, 0, 1, 9, 0), new Date(2026, 0, 1, 18, 0))).toBe(true);
    });

    it('不同日期', () => {
      expect(isSameDay(new Date(2026, 0, 1), new Date(2026, 0, 2))).toBe(false);
    });
  });

  describe('交易日推算（tradingCalendarEngine.getNthTradingDay）', () => {
    it('周五加1工作日到周一', () => {
      // 2026-03-27 is Friday
      expect(getNthTradingDay('2026-03-27', 1)).toBe('2026-03-30');
    });

    it('加5工作日', () => {
      // Mon + 5 trading days = next Mon
      expect(getNthTradingDay('2026-03-23', 5)).toBe('2026-03-30');
    });
  });

  describe('时间戳转换', () => {
    it('秒级时间戳', () => {
      const d = timestampToDate(1709280000, 's');
      expect(d.getFullYear()).toBeGreaterThan(2020);
    });

    it('毫秒级时间戳', () => {
      const d = timestampToDate(1709280000000, 'ms');
      expect(d.getFullYear()).toBeGreaterThan(2020);
    });
  });
});
