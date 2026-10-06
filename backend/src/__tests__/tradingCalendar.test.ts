/**
 * 交易日历测试 —— 真正 import 生产模块 `utils/tradingCalendar` 并测它。
 *
 * 历史问题（本文件曾为「自己测自己」的假测试）：
 *   旧版在测试文件内部自己定义了 `isWeekend()` / `isTradingTime()` /
 *   `nextTradingDay()` / `countTradingDays()` / `getSession()`，然后断言这些
 *   内联函数的输出，全程没有 import 任何生产代码 —— 零生产价值，且让
 *   「项目已有交易日历」看起来成立（实则 `utils/tradingCalendar.ts` 当时并不存在）。
 *   本版全部断言打到真实生产实现上。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isTradingDay,
  isWeekend,
  nonTradingReason,
  latestTradingDay,
  nextTradingDay,
  prevTradingDay,
  tradingDaysBetween,
  resolveQueryDate,
  hasQuoteData,
  latestTradingDayWithData,
  today,
  toDateString,
  addDays,
  daysBetween,
  resetTradingCalendarCache,
  calendarPrecisionOfYear,
  reconcileCalendarWithQuotes,
  candidateTradingDaysWithData,
} from '../utils/tradingCalendar';

/**
 * 2026 年沪深北交易所公告的休市安排（2025-12-22 公告）。
 * 逐条列出其中的**工作日**休市日（周末休市由 isWeekend 覆盖）。
 */
const HOLIDAY_WEEKDAYS_2026 = [
  '2026-01-01', // 元旦 Thu
  '2026-01-02', // 元旦 Fri
  '2026-02-16', // 春节 Mon
  '2026-02-17', // 春节 Tue
  '2026-02-18', // 春节 Wed
  '2026-02-19', // 春节 Thu
  '2026-02-20', // 春节 Fri
  '2026-02-23', // 春节 Mon
  '2026-04-06', // 清明节 Mon
  '2026-05-01', // 劳动节 Fri
  '2026-05-04', // 劳动节 Mon
  '2026-05-05', // 劳动节 Tue
  '2026-06-19', // 端午节 Fri
  '2026-09-25', // 中秋节 Fri
  '2026-10-01', // 国庆节 Thu
  '2026-10-02', // 国庆节 Fri
  '2026-10-05', // 国庆节 Mon
  '2026-10-06', // 国庆节 Tue
  '2026-10-07', // 国庆节 Wed
] as const;

describe('tradingCalendar（生产实现）', () => {
  beforeEach(() => {
    resetTradingCalendarCache();
  });

  describe('周末识别', () => {
    it('周六应识别为非交易日', () => {
      expect(isWeekend('2026-03-21')).toBe(true);
      expect(isTradingDay('2026-03-21')).toBe(false);
    });

    it('周日应识别为非交易日', () => {
      expect(isWeekend('2026-03-22')).toBe(true);
      expect(isTradingDay('2026-03-22')).toBe(false);
    });

    it('周一至周五应识别为交易日（3月无节假日）', () => {
      expect(isTradingDay('2026-03-23')).toBe(true); // Mon
      expect(isTradingDay('2026-03-24')).toBe(true); // Tue
      expect(isTradingDay('2026-03-25')).toBe(true); // Wed
      expect(isTradingDay('2026-03-26')).toBe(true); // Thu
      expect(isTradingDay('2026-03-27')).toBe(true); // Fri
    });

    it('nonTradingReason 应给出中文原因', () => {
      expect(nonTradingReason('2026-03-21')).toBe('周末');
      expect(nonTradingReason('2026-10-01')).toBe('国庆节');
      expect(nonTradingReason('2026-03-23')).toBeNull();
    });
  });

  describe('2026 年法定休市日（交易所公告）', () => {
    it.each(HOLIDAY_WEEKDAYS_2026)('%s 应为非交易日', (d) => {
      expect(isTradingDay(d)).toBe(false);
    });

    it('元旦 1/1-1/3 休市，节后首个交易日为 1/5', () => {
      expect(tradingDaysBetween('2026-01-01', '2026-01-04')).toEqual([]);
      expect(isTradingDay('2026-01-05')).toBe(true);
    });

    it('春节 2/15-2/23 全周休市，2/24 起开市', () => {
      expect(tradingDaysBetween('2026-02-15', '2026-02-23')).toEqual([]);
      expect(isTradingDay('2026-02-24')).toBe(true);
    });

    it('劳动节 5/1-5/5 休市，5/6 起开市', () => {
      expect(tradingDaysBetween('2026-05-01', '2026-05-05')).toEqual([]);
      expect(isTradingDay('2026-05-06')).toBe(true);
    });

    it('中秋 9/25-9/27 休市，9/28 起开市', () => {
      expect(isTradingDay('2026-09-25')).toBe(false);
      expect(tradingDaysBetween('2026-09-25', '2026-09-27')).toEqual([]);
      expect(isTradingDay('2026-09-28')).toBe(true);
    });

    it('国庆 10/1-10/7 全周休市，10/8 起开市', () => {
      expect(tradingDaysBetween('2026-10-01', '2026-10-07')).toEqual([]);
      expect(isTradingDay('2026-10-08')).toBe(true);
    });
  });

  describe('latestTradingDay（纯日历，不查库）', () => {
    it('国庆长假应回退到节前最后一个交易日 2026-09-30', () => {
      // 09-30 是国庆前最后一个交易日；10-01~10-07 全周休市
      expect(latestTradingDay('2026-10-06')).toBe('2026-09-30');
      expect(latestTradingDay('2026-10-07')).toBe('2026-09-30');
      expect(latestTradingDay('2026-10-01')).toBe('2026-09-30');
    });

    it('中秋应回退到 2026-09-24', () => {
      expect(latestTradingDay('2026-09-25')).toBe('2026-09-24');
    });

    it('春节应回退到节前最后交易日 2026-02-13', () => {
      // 2/15(周日)~2/23(周一) 休市，节前最后交易日为 2/13(周五)
      expect(latestTradingDay('2026-02-20')).toBe('2026-02-13');
    });

    it('周末应回退到周五', () => {
      expect(latestTradingDay('2026-03-21')).toBe('2026-03-20'); // Sat → Fri
      expect(latestTradingDay('2026-03-22')).toBe('2026-03-20'); // Sun → Fri
    });

    it('交易日自身应原样返回', () => {
      expect(latestTradingDay('2026-09-30')).toBe('2026-09-30');
      expect(latestTradingDay('2026-10-08')).toBe('2026-10-08');
    });

    it('nextTradingDay / prevTradingDay 应跳过休市日', () => {
      expect(nextTradingDay('2026-09-30')).toBe('2026-10-08'); // 国庆前 → 节后
      expect(prevTradingDay('2026-10-08')).toBe('2026-09-30'); // 节后 → 节前
      expect(nextTradingDay('2026-03-20')).toBe('2026-03-23'); // Fri → Mon
    });
  });

  describe('resolveQueryDate —— 统一入口', () => {
    it('【关键】非交易日输入必须回退并标记 isFallback:true', async () => {
      const r = await resolveQueryDate('2026-10-06', { useDatabase: false });
      expect(r.isFallback).toBe(true);
      expect(r.date).toBe('2026-09-30');
      expect(r.requestedDate).toBe('2026-10-06');
      expect(r.reason).toContain('国庆节');
    });

    it('【关键】回退时 note 必须含中文并讲清「实际看的是哪一天」', async () => {
      const r = await resolveQueryDate('2026-10-06', { useDatabase: false });
      expect(r.note).toBeDefined();
      // 须同时包含：原始请求日、回退目标日、中文说明
      expect(r.note).toContain('2026-10-06');
      expect(r.note).toContain('2026-09-30');
      expect(r.note).toMatch(/回退/);
      expect(r.note).toMatch(/[一-龥]/); // 确实含中文字符
    });

    it('【关键】不传参时若今天非交易日，必须诚实回退', async () => {
      const r = await resolveQueryDate(undefined, { useDatabase: false });
      const t = today();
      if (isTradingDay(t)) {
        expect(r.isFallback).toBe(false);
        expect(r.date).toBe(t);
      } else {
        // 长假期间：绝不能把最近交易日伪装成今天
        expect(r.isFallback).toBe(true);
        expect(r.date).toBe(latestTradingDay(t));
        expect(r.note).toMatch(/回退/);
        expect(r.note).toContain(t);
      }
    });

    it('【关键】交易日输入时 isFallback 必须为 false（不得误报回退）', async () => {
      const r = await resolveQueryDate('2026-09-30', { useDatabase: false });
      expect(r.isFallback).toBe(false);
      expect(r.date).toBe('2026-09-30');
      expect(r.requestedDate).toBe('2026-09-30');
    });

    it('PG 不可用时不得声称已交叉校验', async () => {
      const r = await resolveQueryDate('2026-10-06', { useDatabase: false });
      expect(r.dataAvailable).toBeNull();
      expect(r.calendarSource).toBe('builtin-holiday-table');
    });

    it('useDatabase:false 时不得把「库无数据」当作回退理由', async () => {
      // 2026-09-30 是真实交易日（虽本地库无该日数据）。
      // 关掉库校验后回退理由只能是「非交易日」；若理由变成「库无数据」，
      // 就把「数据缺失」伪装成了「市场休市」，属诚实红线违规。
      const r = await resolveQueryDate('2026-09-30', { useDatabase: false });
      expect(r.isFallback).toBe(false);
      expect(r.reason).toBeNull();
    });

    it('非法日期应抛错而非静默产出错误日期', () => {
      expect(() => toDateString('2026-02-30')).toThrow(/合法日历日/);
      expect(() => toDateString('not-a-date')).toThrow();
      expect(() => toDateString('2026-13-01')).toThrow();
    });
  });

  describe('PG 交叉校验（PG 不可用则优雅跳过，不红）', () => {
    /**
     * 关键诚实性断言：`daily_quotes` 中存在**假期/周末抹布行**
     * （实测 2026-10-04/05/06 各有 5541 行，而 10-06 实为国庆休市；
     *   600519.SH 在这三天 OHLCV 完全相同）。
     * 因此 PG 只允许在交易日历认可的日期里做优选，绝不能反向否定公告的休市安排。
     */
    it('库中假期抹布行不得被当作交易日', async () => {
      if ((await hasQuoteData('2026-10-06')) === null) return; // PG 不可用 → 跳过
      expect(isTradingDay('2026-10-06')).toBe(false);
      expect(nonTradingReason('2026-10-06')).toBe('国庆节');
    });

    it('latestTradingDayWithData 返回的日期必须是真实交易日', async () => {
      const d = await latestTradingDayWithData('2026-10-06');
      if (d === null) return; // PG 不可用 → 跳过
      expect(isTradingDay(d)).toBe(true);
      expect(d <= '2026-10-06').toBe(true);
    });

    it('交叉校验后的日期不得晚于纯日历结果', async () => {
      const withData = await latestTradingDayWithData('2026-10-06');
      if (withData === null) return;
      expect(withData <= latestTradingDay('2026-10-06')).toBe(true);
    });
  });

  describe('日期工具（时区正确性）', () => {
    it('addDays 应正确跨月跨年', () => {
      expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('daysBetween 应正确计算间隔', () => {
      expect(daysBetween('2026-09-30', '2026-10-06')).toBe(6);
      expect(daysBetween('2026-10-06', '2026-09-30')).toBe(-6);
      expect(daysBetween('2026-10-06', '2026-10-06')).toBe(0);
    });

    it('字符串日期不应因 UTC 偏移退化成前一天', () => {
      // 旧写法 new Date('2026-10-06').toISOString().slice(0,10) 在 CST 下得到 2026-10-05
      expect(toDateString('2026-10-06')).toBe('2026-10-06');
      expect(toDateString('2026-01-01')).toBe('2026-01-01');
    });

    it('tradingDaysBetween 起止颠倒应自动纠正为升序', () => {
      expect(tradingDaysBetween('2026-10-08', '2026-09-28')).toEqual(
        tradingDaysBetween('2026-09-28', '2026-10-08'),
      );
    });

    it('2026 年交易日总数应为 242 天（算术自洽校验）', () => {
      // 2026 共 261 个工作日，扣除 19 个法定休市工作日 = 242
      expect(tradingDaysBetween('2026-01-01', '2026-12-31')).toHaveLength(242);
    });
  });

  describe('2025 年内置表（公告原文，2024-12-23 发布）', () => {
    it('2025 法定假日工作日均判为非交易日', () => {
      for (const d of [
        '2025-01-01', // 元旦 Wed
        '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', // 春节
        '2025-04-04', // 清明 Fri
        '2025-05-01', '2025-05-02', '2025-05-05', // 劳动节
        '2025-06-02', // 端午 Mon
        '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-08', // 国庆中秋
      ]) {
        expect(isTradingDay(d)).toBe(false);
      }
    });

    it('2025 春节 1/28–2/4 休市，2/5 起开市', () => {
      expect(tradingDaysBetween('2025-01-28', '2025-02-04')).toEqual([]);
      expect(isTradingDay('2025-02-05')).toBe(true);
    });

    it('2025 国庆中秋 10/1–10/8 休市，10/9 起开市', () => {
      expect(tradingDaysBetween('2025-10-01', '2025-10-08')).toEqual([]);
      expect(isTradingDay('2025-10-09')).toBe(true);
    });

    it('2025 交易日总数应为 243 天', () => {
      expect(tradingDaysBetween('2025-01-01', '2025-12-31')).toHaveLength(243);
    });
  });

  describe('精度标注（诚实红线：不得静默假装全年精确）', () => {
    it('2025/2026 有交易所公告 → official', () => {
      expect(calendarPrecisionOfYear(2025)).toBe('official');
      expect(calendarPrecisionOfYear(2026)).toBe('official');
    });

    it('2027 交易所公告未发布 → provisional（近似）', () => {
      // 交易所历年于头一年12月中下旬发布次年安排，2027 公告尚未发布
      expect(calendarPrecisionOfYear(2027)).toBe('provisional');
    });

    it('未覆盖年份 → unavailable', () => {
      expect(calendarPrecisionOfYear(2030)).toBe('unavailable');
    });

    it('provisional 年份的 resolveQueryDate 必须声明近似', async () => {
      const r = await resolveQueryDate('2027-10-05', { useDatabase: false });
      expect(r.note).toContain('尚未发布');
      expect(r.note).toContain('近似');
    });

    it('unavailable 年份的 resolveQueryDate 必须声明精度较低', async () => {
      const r = await resolveQueryDate('2030-01-02', { useDatabase: false });
      expect(r.note).toContain('内置日历未覆盖');
      expect(r.note).toContain('精度较低');
    });
  });

  describe('日历 × 库对账（reconcileCalendarWithQuotes）', () => {
    it('应区分「佐证/库中缺/抹布行」三类', () => {
      const calendarDays = ['2026-09-24', '2026-09-25', '2026-09-28'];
      const quoteDates = new Set(['2026-09-24', '2026-10-06']); // 10-06 是抹布行

      const r = reconcileCalendarWithQuotes(calendarDays, quoteDates);

      expect(r.corroborated).toEqual(['2026-09-24']); // 09-24 日历与库一致
      expect(r.missingInDb).toEqual(['2026-09-25', '2026-09-28']); // 日历有、库无
      expect(r.smearedInDb).toEqual(['2026-10-06']); // 库有、日历判非交易日
    });

    it('抹布行绝不可出现在「日历有数据佐证」的候选里', () => {
      const r = reconcileCalendarWithQuotes(
        ['2026-09-24'],
        new Set(['2026-09-24', '2026-10-06']),
      );
      expect(r.corroborated).not.toContain('2026-10-06');
    });

    it('连续佐证天数应正确统计（连续段取最长）', () => {
      //09-22/09-24 连续；09-18 之后断开
      const r = reconcileCalendarWithQuotes(
        ['2026-09-18', '2026-09-22', '2026-09-23', '2026-09-24'],
        new Set(['2026-09-18', '2026-09-22', '2026-09-23', '2026-09-24']),
      );
      expect(r.consecutiveEvidence).toBe(3); // 09-22~09-24 连续 3 天
    });
  });
});