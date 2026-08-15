import { describe, it, expect } from 'vitest';
import {
  analyzeMonthEffect,
  analyzeDayOfWeekEffect,
  analyzeTurnOfMonthEffect,
  analyzeHolidayEffect,
  generateCalendarAnomalyReport,
  checkCalendarPersistence,
  type DailyReturn,
} from '../utils/calendarAnomalyEngine';

/**
 * 日历异象引擎测试
 * 月份效应 / 星期效应 / 月初月末效应 / 节假日效应 / 报告 / 持续性
 * (Rewritten to import the real module functions; deterministic data, no Math.random.)
 */

function makeReturns(n: number): DailyReturn[] {
  const out: DailyReturn[] = [];
  for (let i = 0; i < n; i++) {
    const dayOfYear = i % 365;
    const year = 2022 + Math.floor(i / 365);
    const month = (dayOfYear % 12) + 1;
    const day = (dayOfYear % 28) + 1;
    out.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      return: ((i * 7) % 11) / 1000 - 0.003,
      volume: 1_000_000 + (i * 13) % 500_000,
    });
  }
  return out;
}

describe('日历异象引擎', () => {
  describe('analyzeMonthEffect', () => {
    it('returns 12 month effects numbered 1-12', () => {
      const effects = analyzeMonthEffect(makeReturns(400));
      expect(effects).toHaveLength(12);
      effects.forEach((m, i) => {
        expect(m.month).toBe(i + 1);
        expect(m.monthName).toBeTruthy();
        expect(m.winRate).toBeGreaterThanOrEqual(0);
        expect(m.winRate).toBeLessThanOrEqual(100);
      });
    });

    it('handles empty input without crashing', () => {
      const effects = analyzeMonthEffect([]);
      expect(effects).toHaveLength(12);
      expect(effects.every(m => m.avgReturn === 0)).toBe(true);
    });
  });

  describe('analyzeDayOfWeekEffect', () => {
    it('returns 5 weekday effects (Mon-Fri)', () => {
      const effects = analyzeDayOfWeekEffect(makeReturns(400));
      expect(effects).toHaveLength(5);
      effects.forEach((d, i) => {
        expect(d.dayOfWeek).toBe(i);
        expect(d.dayName).toBeTruthy();
        expect(d.winRate).toBeGreaterThanOrEqual(0);
        expect(d.winRate).toBeLessThanOrEqual(100);
        expect(d.volumeRatio).toBeGreaterThan(0);
      });
    });

    it('skips weekend dates', () => {
      const weekendOnly: DailyReturn[] = [
        { date: '2024-01-06', return: 0.01, volume: 100 }, // Saturday
        { date: '2024-01-07', return: 0.02, volume: 100 }, // Sunday
      ];
      const effects = analyzeDayOfWeekEffect(weekendOnly);
      expect(effects.every(d => d.avgReturn === 0)).toBe(true);
    });
  });

  describe('analyzeTurnOfMonthEffect', () => {
    it('returns start/mid/end periods', () => {
      const effects = analyzeTurnOfMonthEffect(makeReturns(400));
      expect(effects.map(e => e.period)).toEqual(['start', 'mid', 'end']);
      effects.forEach(e => {
        expect(typeof e.avgReturn).toBe('number');
        expect(e.winRate).toBeGreaterThanOrEqual(0);
        expect(e.winRate).toBeLessThanOrEqual(100);
      });
    });

    it('only start period is populated when all dates are <=5', () => {
      const onlyStart: DailyReturn[] = Array.from({ length: 5 }, (_, i) => ({
        date: `2024-03-${String(i + 1).padStart(2, '0')}`,
        return: 0.02,
        volume: 100,
      }));
      const effects = analyzeTurnOfMonthEffect(onlyStart);
      const start = effects.find(e => e.period === 'start')!;
      const mid = effects.find(e => e.period === 'mid')!;
      const end = effects.find(e => e.period === 'end')!;
      expect(start.avgReturn).toBeGreaterThan(0);
      expect(mid.avgReturn).toBe(0);
      expect(end.avgReturn).toBe(0);
    });
  });

  describe('analyzeHolidayEffect', () => {
    it('returns an effect for each Chinese holiday', () => {
      const effects = analyzeHolidayEffect(makeReturns(400));
      expect(effects.length).toBe(6); // CN_HOLIDAYS has 6 entries
      effects.forEach(e => {
        expect(e.holiday).toBeTruthy();
        expect(typeof e.beforeAvgReturn).toBe('number');
        expect(typeof e.afterAvgReturn).toBe('number');
        expect(typeof e.sampleSize).toBe('number');
      });
    });
  });

  describe('generateCalendarAnomalyReport', () => {
    it('returns a structured report', () => {
      const report = generateCalendarAnomalyReport(makeReturns(400));
      expect(report.monthEffects).toHaveLength(12);
      expect(report.dayOfWeekEffects).toHaveLength(5);
      expect(report.turnOfMonthEffects).toHaveLength(3);
      expect(report.holidayEffects).toHaveLength(6);
      expect(report.topAnomalies.length).toBeLessThanOrEqual(10);
      expect(['bullish', 'bearish', 'neutral']).toContain(report.marketPhase);
      expect(typeof report.currentSignal).toBe('string');
    });

    it('detects bullish market phase from recent positive returns', () => {
      const data = makeReturns(100);
      for (let i = data.length - 20; i < data.length; i++) data[i].return = 0.01;
      const report = generateCalendarAnomalyReport(data);
      expect(report.marketPhase).toBe('bullish');
    });

    it('detects bearish market phase from recent negative returns', () => {
      const data = makeReturns(100);
      for (let i = data.length - 20; i < data.length; i++) data[i].return = -0.01;
      const report = generateCalendarAnomalyReport(data);
      expect(report.marketPhase).toBe('bearish');
    });
  });

  describe('checkCalendarPersistence', () => {
    it('computes month and weekday persistence', () => {
      const result = checkCalendarPersistence(makeReturns(200), 60);
      expect(result.monthPersistence).toHaveLength(12);
      expect(result.dowPersistence).toHaveLength(5);
      result.monthPersistence.forEach(p => {
        expect(p.month).toBeGreaterThanOrEqual(1);
        expect(p.month).toBeLessThanOrEqual(12);
        expect(typeof p.diverging).toBe('boolean');
      });
    });
  });
});
