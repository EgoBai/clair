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

function generateDailyReturns(days: number): DailyReturn[] {
  const returns: DailyReturn[] = [];
  const startDate = new Date('2020-01-01');

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue; // Skip weekends

    returns.push({
      date: date.toISOString().split('T')[0],
      return: (Math.random() - 0.5) * 0.04,
      volume: Math.floor(100000 + Math.random() * 50000),
    });
  }
  return returns;
}

const mockReturns = generateDailyReturns(1000);

describe('日历异象引擎', () => {
  describe('analyzeMonthEffect', () => {
    it('should return 12 months', () => {
      const effects = analyzeMonthEffect(mockReturns);
      expect(effects.length).toBe(12);
    });

    it('should have valid month names', () => {
      const effects = analyzeMonthEffect(mockReturns);
      effects.forEach(e => {
        expect(e.month).toBeGreaterThanOrEqual(1);
        expect(e.month).toBeLessThanOrEqual(12);
        expect(e.monthName).toBeTruthy();
      });
    });

    it('should calculate win rates between 0-100', () => {
      const effects = analyzeMonthEffect(mockReturns);
      effects.forEach(e => {
        expect(e.winRate).toBeGreaterThanOrEqual(0);
        expect(e.winRate).toBeLessThanOrEqual(100);
      });
    });

    it('should handle empty data', () => {
      const effects = analyzeMonthEffect([]);
      expect(effects.length).toBe(12);
      effects.forEach(e => {
        expect(e.avgReturn).toBe(0);
      });
    });
  });

  describe('analyzeDayOfWeekEffect', () => {
    it('should return 5 weekdays', () => {
      const effects = analyzeDayOfWeekEffect(mockReturns);
      expect(effects.length).toBe(5);
    });

    it('should have valid day names', () => {
      const effects = analyzeDayOfWeekEffect(mockReturns);
      const expectedDays = ['周一', '周二', '周三', '周四', '周五'];
      effects.forEach((e, i) => {
        expect(e.dayName).toBe(expectedDays[i]);
        expect(e.dayOfWeek).toBe(i);
      });
    });

    it('should calculate volume ratios', () => {
      const effects = analyzeDayOfWeekEffect(mockReturns);
      effects.forEach(e => {
        expect(e.volumeRatio).toBeGreaterThan(0);
      });
    });
  });

  describe('analyzeTurnOfMonthEffect', () => {
    it('should return 3 periods', () => {
      const effects = analyzeTurnOfMonthEffect(mockReturns);
      expect(effects.length).toBe(3);
    });

    it('should have start, mid, end periods', () => {
      const effects = analyzeTurnOfMonthEffect(mockReturns);
      expect(effects.map(e => e.period)).toEqual(['start', 'mid', 'end']);
    });

    it('should calculate excess returns', () => {
      const effects = analyzeTurnOfMonthEffect(mockReturns);
      effects.forEach(e => {
        expect(typeof e.excessReturn).toBe('number');
      });
    });
  });

  describe('analyzeHolidayEffect', () => {
    it('should return Chinese holidays', () => {
      const effects = analyzeHolidayEffect(mockReturns);
      expect(effects.length).toBeGreaterThan(0);
      expect(effects.some(e => e.holiday === '春节')).toBe(true);
      expect(effects.some(e => e.holiday === '国庆节')).toBe(true);
    });

    it('should have before and after returns', () => {
      const effects = analyzeHolidayEffect(mockReturns);
      effects.forEach(e => {
        expect(typeof e.beforeAvgReturn).toBe('number');
        expect(typeof e.afterAvgReturn).toBe('number');
        expect(e.beforeWinRate).toBeGreaterThanOrEqual(0);
        expect(e.afterWinRate).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle empty data', () => {
      const effects = analyzeHolidayEffect([]);
      expect(effects.length).toBeGreaterThan(0);
      effects.forEach(e => {
        expect(e.sampleSize).toBe(0);
      });
    });
  });

  describe('generateCalendarAnomalyReport', () => {
    it('should generate complete report', () => {
      const report = generateCalendarAnomalyReport(mockReturns);
      expect(report.monthEffects.length).toBe(12);
      expect(report.dayOfWeekEffects.length).toBe(5);
      expect(report.turnOfMonthEffects.length).toBe(3);
      expect(report.holidayEffects.length).toBeGreaterThan(0);
      expect(report.topAnomalies.length).toBeLessThanOrEqual(10);
      expect(['bullish', 'bearish', 'neutral']).toContain(report.marketPhase);
    });

    it('should have top anomalies sorted by significance', () => {
      const report = generateCalendarAnomalyReport(mockReturns);
      for (let i = 1; i < report.topAnomalies.length; i++) {
        expect(Math.abs(report.topAnomalies[i].tStatistic))
          .toBeLessThanOrEqual(Math.abs(report.topAnomalies[i - 1].tStatistic));
      }
    });

    it('should include current signal', () => {
      const report = generateCalendarAnomalyReport(mockReturns);
      expect(typeof report.currentSignal).toBe('string');
      expect(report.currentSignal.length).toBeGreaterThan(0);
    });
  });

  describe('checkCalendarPersistence', () => {
    it('should check month persistence', () => {
      const result = checkCalendarPersistence(mockReturns, 60);
      expect(result.monthPersistence.length).toBe(12);
      result.monthPersistence.forEach(p => {
        expect(typeof p.recent).toBe('number');
        expect(typeof p.historical).toBe('number');
        expect(typeof p.diverging).toBe('boolean');
      });
    });

    it('should check day-of-week persistence', () => {
      const result = checkCalendarPersistence(mockReturns, 60);
      expect(result.dowPersistence.length).toBe(5);
      result.dowPersistence.forEach(p => {
        expect(typeof p.recent).toBe('number');
        expect(typeof p.historical).toBe('number');
        expect(typeof p.diverging).toBe('boolean');
      });
    });

    it('should handle short data', () => {
      const shortReturns = generateDailyReturns(10);
      const result = checkCalendarPersistence(shortReturns, 60);
      expect(result.monthPersistence.length).toBe(12);
    });
  });
});
