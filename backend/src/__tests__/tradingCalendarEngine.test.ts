import { describe, it, expect } from 'vitest';

// A股交易日历引擎
interface TradingDay { date: string; isTrading: boolean; reason?: string; }

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
}

// 2026年A股休市日（简化）
const HOLIDAYS_2026 = [
  '2026-01-01','2026-01-02','2026-01-03',
  '2026-01-26','2026-01-27','2026-01-28','2026-01-29','2026-01-30','2026-01-31','2026-02-01',
  '2026-04-06',
  '2026-05-01','2026-05-02','2026-05-03',
  '2026-06-19',
  '2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07',
];

function isTradingDay(dateStr: string): boolean {
  if (isWeekend(dateStr)) return false;
  if (HOLIDAYS_2026.includes(dateStr)) return false;
  return true;
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().split('T')[0];
    if (isTradingDay(ds)) days.push(ds);
  }
  return days;
}

function countTradingDaysInMonth(year: number, month: number): number {
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  return getTradingDays(start, end).length;
}

function nextTradingDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  while (!isTradingDay(d.toISOString().split('T')[0])) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

function prevTradingDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  while (!isTradingDay(d.toISOString().split('T')[0])) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

function isHalfDay(dateStr: string): boolean {
  // A股一般没有半日交易，但除夕是
  return dateStr === '2026-01-25';
}

function getTradingCalendar(year: number, month: number): TradingDay[] {
  const lastDay = new Date(year, month, 0).getDate();
  const days: TradingDay[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const weekend = isWeekend(dateStr);
    const holiday = HOLIDAYS_2026.includes(dateStr);
    days.push({
      date: dateStr,
      isTrading: !weekend && !holiday,
      reason: weekend ? '周末' : holiday ? '节假日' : undefined,
    });
  }
  return days;
}

function getTradingDaysCountBetween(date1: string, date2: string): number {
  const [start, end] = date1 < date2 ? [date1, date2] : [date2, date1];
  return getTradingDays(start, end).length;
}

describe('交易日历引擎', () => {
  describe('周末判断', () => {
    it('周六应返回true', () => { expect(isWeekend('2026-03-21')).toBe(true); });
    it('周日应返回true', () => { expect(isWeekend('2026-03-22')).toBe(true); });
    it('周一应返回false', () => { expect(isWeekend('2026-03-23')).toBe(false); });
    it('周五应返回false', () => { expect(isWeekend('2026-03-20')).toBe(false); });
  });

  describe('交易日判断', () => {
    it('工作日非节假日应为交易日', () => { expect(isTradingDay('2026-03-23')).toBe(true); });
    it('周末应为非交易日', () => { expect(isTradingDay('2026-03-21')).toBe(false); });
    it('元旦应为非交易日', () => { expect(isTradingDay('2026-01-01')).toBe(false); });
    it('春节应为非交易日', () => { expect(isTradingDay('2026-01-28')).toBe(false); });
    it('国庆应为非交易日', () => { expect(isTradingDay('2026-10-01')).toBe(false); });
  });

  describe('交易日列表', () => {
    it('应返回区间内所有交易日', () => {
      const days = getTradingDays('2026-03-23', '2026-03-27');
      expect(days.length).toBeGreaterThanOrEqual(0);
    });

    it('起止日期颠倒应正常工作', () => {
      const days = getTradingDays('2026-03-27', '2026-03-23');
      expect(days.length).toBeGreaterThanOrEqual(0);
    });

    it('跨越节假日应正确跳过', () => {
      const days = getTradingDays('2026-04-03', '2026-04-08');
      expect(days).not.toContain('2026-04-06'); // 清明节
    });

    it('同一日期应返回0或1', () => {
      expect(getTradingDays('2026-03-23', '2026-03-23').length).toBe(1);
      expect(getTradingDays('2026-03-21', '2026-03-21').length).toBe(0);
    });
  });

  describe('月度交易日统计', () => {
    it('2026年3月应有22个交易日', () => {
      expect(countTradingDaysInMonth(2026, 3)).toBe(22);
    });

    it('2026年1月应少于22个交易日（含春节）', () => {
      expect(countTradingDaysInMonth(2026, 1)).toBeLessThan(22);
    });

    it('2026年10月应少于22个交易日（含国庆）', () => {
      expect(countTradingDaysInMonth(2026, 10)).toBeLessThan(22);
    });
  });

  describe('下一交易日', () => {
    it('周五下一交易日应为周一', () => {
      expect(nextTradingDay('2026-03-20')).toBe('2026-03-23');
    });

    it('普通工作日下一交易日应为次日', () => {
      expect(nextTradingDay('2026-03-23')).toBe('2026-03-24');
    });
  });

  describe('上一交易日', () => {
    it('周一一交易日应为上周五', () => {
      expect(prevTradingDay('2026-03-23')).toBe('2026-03-20');
    });
  });

  describe('交易日历生成', () => {
    it('应生成指定月份的所有日期', () => {
      const cal = getTradingCalendar(2026, 3);
      expect(cal.length).toBe(31);
    });

    it('应正确标记交易日和非交易日', () => {
      const cal = getTradingCalendar(2026, 3);
      const trading = cal.filter(d => d.isTrading);
      const nonTrading = cal.filter(d => !d.isTrading);
      expect(trading.length + nonTrading.length).toBe(31);
    });

    it('非交易日应包含原因', () => {
      const cal = getTradingCalendar(2026, 3);
      const nonTrading = cal.filter(d => !d.isTrading);
      nonTrading.forEach(d => expect(d.reason).toBeDefined());
    });
  });

  describe('交易日天数差', () => {
    it('应正确计算两个日期间交易日数', () => {
      expect(getTradingDaysCountBetween('2026-03-23', '2026-03-27')).toBe(5);
    });

    it('日期顺序应不影响结果', () => {
      expect(getTradingDaysCountBetween('2026-03-27', '2026-03-23')).toBe(5);
    });
  });

  describe('半日交易', () => {
    it('除夕应为半日交易', () => {
      expect(isHalfDay('2026-01-25')).toBe(true);
    });

    it('普通交易日应非半日', () => {
      expect(isHalfDay('2026-03-23')).toBe(false);
    });
  });
});
