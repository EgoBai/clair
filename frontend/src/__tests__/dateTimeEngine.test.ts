import { describe, it, expect } from 'vitest';

// ===== 日期与时间处理引擎 =====
describe('Date & Time Processing Engine', () => {
  // 日期格式化
  const formatDate = (date: Date, format: string = 'YYYY-MM-DD'): string => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return format
      .replace('YYYY', date.getFullYear().toString())
      .replace('MM', pad(date.getMonth() + 1))
      .replace('DD', pad(date.getDate()))
      .replace('HH', pad(date.getHours()))
      .replace('mm', pad(date.getMinutes()))
      .replace('ss', pad(date.getSeconds()));
  };

  // 相对时间
  const timeAgo = (date: Date, now: Date = new Date()): string => {
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}个月前`;
    return `${Math.floor(months / 12)}年前`;
  };

  // 是否交易日(简单版: 周一到周五)
  const isTradingDay = (date: Date): boolean => {
    const day = date.getDay();
    return day >= 1 && day <= 5;
  };

  // 获取交易日数
  const countTradingDays = (start: Date, end: Date): number => {
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      if (isTradingDay(current)) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  // 季度判断
  const getQuarter = (date: Date): number => Math.floor(date.getMonth() / 3) + 1;

  // 年初至今天数
  const daysSinceYearStart = (date: Date): number => {
    const yearStart = new Date(date.getFullYear(), 0, 1);
    return Math.floor((date.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  };

  // 月末日期
  const endOfMonth = (year: number, month: number): Date => new Date(year, month + 1, 0);

  // 日期区间列表
  const dateRange = (start: Date, end: Date, step: number = 1): Date[] => {
    const dates: Date[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + step);
    }
    return dates;
  };

  // 解析日期字符串
  const parseDate = (str: string): Date | null => {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  // 日期差(天)
  const daysDiff = (a: Date, b: Date): number => {
    return Math.floor(Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
  };

  // 是否同一天
  const isSameDay = (a: Date, b: Date): boolean => {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

  // 添加工作日
  const addBusinessDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    let added = 0;
    const dir = days > 0 ? 1 : -1;
    while (added < Math.abs(days)) {
      result.setDate(result.getDate() + dir);
      if (isTradingDay(result)) added++;
    }
    return result;
  };

  // 时间戳转日期
  const timestampToDate = (ts: number, unit: 's' | 'ms' = 'ms'): Date => {
    return new Date(unit === 's' ? ts * 1000 : ts);
  };

  describe('日期格式化', () => {
    it('默认格式', () => {
      const d = new Date(2026, 2, 15);
      expect(formatDate(d)).toBe('2026-03-15');
    });

    it('含时间', () => {
      const d = new Date(2026, 0, 1, 9, 30, 45);
      expect(formatDate(d, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-01-01 09:30:45');
    });

    it('单数月补零', () => {
      const d = new Date(2026, 0, 5);
      expect(formatDate(d)).toBe('2026-01-05');
    });
  });

  describe('相对时间', () => {
    it('几秒前', () => {
      const now = new Date(2026, 0, 1, 12, 0, 30);
      const date = new Date(2026, 0, 1, 12, 0, 0);
      expect(timeAgo(date, now)).toBe('30秒前');
    });

    it('几分钟前', () => {
      const now = new Date(2026, 0, 1, 12, 30, 0);
      const date = new Date(2026, 0, 1, 12, 0, 0);
      expect(timeAgo(date, now)).toBe('30分钟前');
    });

    it('几小时前', () => {
      const now = new Date(2026, 0, 1, 15, 0, 0);
      const date = new Date(2026, 0, 1, 12, 0, 0);
      expect(timeAgo(date, now)).toBe('3小时前');
    });

    it('几天前', () => {
      const now = new Date(2026, 0, 10, 12, 0, 0);
      const date = new Date(2026, 0, 1, 12, 0, 0);
      expect(timeAgo(date, now)).toBe('9天前');
    });

    it('几个月前', () => {
      const now = new Date(2026, 5, 1);
      const date = new Date(2026, 2, 1);
      expect(timeAgo(date, now)).toBe('3个月前');
    });
  });

  describe('交易日判断', () => {
    it('周一到周五是交易日', () => {
      // 2026-03-23 is Monday
      expect(isTradingDay(new Date(2026, 2, 23))).toBe(true);
      expect(isTradingDay(new Date(2026, 2, 27))).toBe(true); // Friday
    });

    it('周六周日不是交易日', () => {
      expect(isTradingDay(new Date(2026, 2, 28))).toBe(false); // Saturday
      expect(isTradingDay(new Date(2026, 2, 29))).toBe(false); // Sunday
    });
  });

  describe('交易日计数', () => {
    it('整周', () => {
      // Mon to Fri = 5 trading days
      expect(countTradingDays(new Date(2026, 2, 23), new Date(2026, 2, 27))).toBe(5);
    });

    it('跨周末', () => {
      // Fri to Mon = 2 trading days
      expect(countTradingDays(new Date(2026, 2, 27), new Date(2026, 2, 30))).toBe(2);
    });

    it('同一天', () => {
      expect(countTradingDays(new Date(2026, 2, 23), new Date(2026, 2, 23))).toBe(1);
    });
  });

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

  describe('添加工作日', () => {
    it('周五加1工作日到周一', () => {
      // 2026-03-27 is Friday
      const result = addBusinessDays(new Date(2026, 2, 27), 1);
      expect(result.getDay()).toBe(1); // Monday
    });

    it('加5工作日', () => {
      const result = addBusinessDays(new Date(2026, 2, 23), 5); // Mon
      expect(isSameDay(result, new Date(2026, 2, 30))).toBe(true); // Next Mon
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
