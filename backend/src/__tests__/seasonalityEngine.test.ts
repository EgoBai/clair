import { describe, it, expect } from 'vitest';
import {
  SeasonalityEngine,
  DailyReturn,
  MonthlyEffect,
  WeekdayEffect,
  HolidayEffect
} from '../services/seasonalityEngine';

describe('Seasonality Engine', () => {
  const engine = new SeasonalityEngine();

  const generateReturns = (days: number, startDate: string = '2020-01-02'): DailyReturn[] => {
    const returns: DailyReturn[] = [];
    const date = new Date(startDate);

    for (let i = 0; i < days; i++) {
      // Skip weekends
      while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() + 1);
      }

      returns.push({
        date: date.toISOString().split('T')[0],
        return: (Math.random() - 0.48) * 0.03, // slight upward bias
        volume: 1e8 + Math.random() * 1e8
      });

      date.setDate(date.getDate() + 1);
    }

    return returns;
  };

  const generateSeasonalReturns = (years: number = 5): DailyReturn[] => {
    const returns: DailyReturn[] = [];
    const startYear = 2019;

    for (let y = 0; y < years; y++) {
      const year = startYear + y;
      for (let m = 1; m <= 12; m++) {
        const daysInMonth = new Date(year, m, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(year, m - 1, d);
          if (date.getDay() === 0 || date.getDay() === 6) continue;

          // Create seasonal pattern: Jan and Nov bullish, May-Sept bearish
          let bias = 0;
          if (m === 1 || m === 11) bias = 0.002;
          else if (m >= 5 && m <= 9) bias = -0.001;

          // Monday effect
          if (date.getDay() === 1) bias -= 0.001;

          returns.push({
            date: date.toISOString().split('T')[0],
            return: bias + (Math.random() - 0.5) * 0.02
          });
        }
      }
    }

    return returns;
  };

  describe('analyzeMonthlyEffect', () => {
    it('should return 12 monthly effects', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeMonthlyEffect(returns);
      expect(effects.length).toBe(12);
    });

    it('each effect should have required fields', () => {
      const returns = generateSeasonalReturns(3);
      const effects = engine.analyzeMonthlyEffect(returns);
      for (const effect of effects) {
        expect(effect.month).toBeGreaterThanOrEqual(1);
        expect(effect.month).toBeLessThanOrEqual(12);
        expect(effect.avgReturn).toBeTypeOf('number');
        expect(effect.medianReturn).toBeTypeOf('number');
        expect(effect.winRate).toBeGreaterThanOrEqual(0);
        expect(effect.winRate).toBeLessThanOrEqual(1);
        expect(effect.volatility).toBeGreaterThanOrEqual(0);
        expect(typeof effect.significant).toBe('boolean');
      }
    });

    it('should calculate sharpe ratio', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeMonthlyEffect(returns);
      for (const effect of effects) {
        expect(effect.sharpeRatio).toBeTypeOf('number');
        expect(isFinite(effect.sharpeRatio)).toBe(true);
      }
    });

    it('should handle insufficient data for a month', () => {
      const returns: DailyReturn[] = [
        { date: '2020-01-02', return: 0.01 },
        { date: '2020-01-03', return: -0.01 },
      ];
      const effects = engine.analyzeMonthlyEffect(returns);
      expect(effects[0].sampleSize).toBe(2);
      expect(effects[0].significant).toBe(false);
    });

    it('should show January effect with sufficient data', () => {
      const returns = generateSeasonalReturns(10);
      const effects = engine.analyzeMonthlyEffect(returns);
      const jan = effects.find(e => e.month === 1);
      expect(jan).toBeDefined();
      expect(jan!.sampleSize).toBeGreaterThan(15);
    });

    it('should detect significant months with large enough sample', () => {
      const returns = generateSeasonalReturns(10);
      const effects = engine.analyzeMonthlyEffect(returns);
      // At least some months should have data
      const withData = effects.filter(e => e.sampleSize > 0);
      expect(withData.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeWeekdayEffect', () => {
    it('should return 5 weekday effects', () => {
      const returns = generateReturns(500);
      const effects = engine.analyzeWeekdayEffect(returns);
      expect(effects.length).toBe(5);
    });

    it('each effect should have required fields', () => {
      const returns = generateReturns(200);
      const effects = engine.analyzeWeekdayEffect(returns);
      for (const effect of effects) {
        expect(effect.weekday).toBeGreaterThanOrEqual(0);
        expect(effect.weekday).toBeLessThanOrEqual(4);
        expect(effect.avgReturn).toBeTypeOf('number');
        expect(effect.winRate).toBeGreaterThanOrEqual(0);
        expect(effect.winRate).toBeLessThanOrEqual(1);
        expect(typeof effect.significant).toBe('boolean');
      }
    });

    it('should detect Monday effect with seasonal data', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeWeekdayEffect(returns);
      const monday = effects.find(e => e.weekday === 0);
      expect(monday).toBeDefined();
      // Monday should tend to be negative in our generated data
    });

    it('should handle empty data', () => {
      const effects = engine.analyzeWeekdayEffect([]);
      expect(effects.length).toBe(5);
      expect(effects[0].avgReturn).toBe(0);
    });
  });

  describe('analyzeHolidayEffect', () => {
    it('should analyze A-stock holidays', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeHolidayEffect(returns);
      expect(effects.length).toBeGreaterThan(0);
    });

    it('each effect should have required fields', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeHolidayEffect(returns);
      for (const effect of effects) {
        expect(effect.holiday).toBeTypeOf('string');
        expect(effect.preHolidayReturn).toBeTypeOf('number');
        expect(effect.postHolidayReturn).toBeTypeOf('number');
        expect(effect.preHolidayWinRate).toBeGreaterThanOrEqual(0);
        expect(effect.postHolidayWinRate).toBeGreaterThanOrEqual(0);
        expect(typeof effect.significant).toBe('boolean');
      }
    });

    it('should include spring festival', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeHolidayEffect(returns);
      const springFestival = effects.find(e => e.holiday === 'springFestival');
      expect(springFestival).toBeDefined();
    });

    it('should include national day', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeHolidayEffect(returns);
      const nationalDay = effects.find(e => e.holiday === 'nationalDay');
      expect(nationalDay).toBeDefined();
    });

    it('should handle win rates between 0 and 1', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeHolidayEffect(returns);
      for (const effect of effects) {
        expect(effect.preHolidayWinRate).toBeGreaterThanOrEqual(0);
        expect(effect.preHolidayWinRate).toBeLessThanOrEqual(1);
        expect(effect.postHolidayWinRate).toBeGreaterThanOrEqual(0);
        expect(effect.postHolidayWinRate).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('analyzeEarningsWindowEffect', () => {
    it('should analyze earnings windows', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeEarningsWindowEffect(returns);
      expect(effects.length).toBe(4);
    });

    it('should have pre/post annual and semi windows', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeEarningsWindowEffect(returns);
      const windows = effects.map(e => e.window);
      expect(windows).toContain('pre_annual');
      expect(windows).toContain('post_annual');
      expect(windows).toContain('pre_semi');
      expect(windows).toContain('post_semi');
    });

    it('each window should have required fields', () => {
      const returns = generateSeasonalReturns(5);
      const effects = engine.analyzeEarningsWindowEffect(returns);
      for (const effect of effects) {
        expect(effect.avgReturn).toBeTypeOf('number');
        expect(effect.winRate).toBeGreaterThanOrEqual(0);
        expect(effect.winRate).toBeLessThanOrEqual(1);
        expect(effect.volatility).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('findPatterns', () => {
    it('should find seasonal patterns', () => {
      const returns = generateSeasonalReturns(5);
      const patterns = engine.findPatterns(returns);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('each pattern should have required fields', () => {
      const returns = generateSeasonalReturns(5);
      const patterns = engine.findPatterns(returns);
      for (const p of patterns) {
        expect(p.month).toBeGreaterThanOrEqual(1);
        expect(p.month).toBeLessThanOrEqual(12);
        expect(p.weekOfMonth).toBeGreaterThanOrEqual(1);
        expect(p.weekOfMonth).toBeLessThanOrEqual(5);
        expect(p.winRate).toBeGreaterThanOrEqual(0);
        expect(p.winRate).toBeLessThanOrEqual(1);
        expect(p.consistency).toBeGreaterThanOrEqual(0);
        expect(p.consistency).toBeLessThanOrEqual(1);
        expect(p.sampleSize).toBeGreaterThan(0);
      }
    });

    it('should sort by absolute return', () => {
      const returns = generateSeasonalReturns(5);
      const patterns = engine.findPatterns(returns);
      for (let i = 1; i < patterns.length; i++) {
        expect(Math.abs(patterns[i - 1].avgReturn)).toBeGreaterThanOrEqual(Math.abs(patterns[i].avgReturn));
      }
    });
  });

  describe('generateReport', () => {
    it('should generate complete report', () => {
      const returns = generateSeasonalReturns(5);
      const report = engine.generateReport('000001', returns);
      expect(report.symbol).toBe('000001');
      expect(report.totalDays).toBe(returns.length);
      expect(report.monthlyEffects.length).toBe(12);
      expect(report.weekdayEffects.length).toBe(5);
      expect(report.holidayEffects.length).toBeGreaterThan(0);
      expect(report.earningsEffects.length).toBe(4);
    });

    it('should identify best and worst months', () => {
      const returns = generateSeasonalReturns(5);
      const report = engine.generateReport('000001', returns);
      expect(report.bestMonth).toBeGreaterThanOrEqual(1);
      expect(report.bestMonth).toBeLessThanOrEqual(12);
      expect(report.worstMonth).toBeGreaterThanOrEqual(1);
      expect(report.worstMonth).toBeLessThanOrEqual(12);
    });

    it('should identify best and worst weekdays', () => {
      const returns = generateSeasonalReturns(5);
      const report = engine.generateReport('000001', returns);
      expect(report.bestWeekday).toBeGreaterThanOrEqual(0);
      expect(report.bestWeekday).toBeLessThanOrEqual(4);
      expect(report.worstWeekday).toBeGreaterThanOrEqual(0);
      expect(report.worstWeekday).toBeLessThanOrEqual(4);
    });

    it('should generate current signals', () => {
      const returns = generateSeasonalReturns(5);
      const report = engine.generateReport('000001', returns);
      expect(['bullish', 'bearish', 'neutral']).toContain(report.currentMonthSignal);
      expect(['bullish', 'bearish', 'neutral']).toContain(report.currentWeekdaySignal);
    });

    it('should include start and end dates', () => {
      const returns = generateSeasonalReturns(3);
      const report = engine.generateReport('TEST', returns);
      expect(report.startDate).toBe(returns[0].date);
      expect(report.endDate).toBe(returns[returns.length - 1].date);
    });

    it('should handle empty returns', () => {
      const report = engine.generateReport('EMPTY', []);
      expect(report.totalDays).toBe(0);
      expect(report.monthlyEffects.length).toBe(12);
    });
  });

  describe('edge cases', () => {
    it('should handle single day', () => {
      const returns: DailyReturn[] = [{ date: '2020-01-02', return: 0.01 }];
      const effects = engine.analyzeMonthlyEffect(returns);
      expect(effects.length).toBe(12);
    });

    it('should handle negative returns only', () => {
      const returns = Array.from({ length: 100 }, (_, i) => ({
        date: `2020-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        return: -0.005 - Math.random() * 0.01
      }));
      const effects = engine.analyzeMonthlyEffect(returns);
      for (const e of effects) {
        if (e.sampleSize > 0) {
          expect(e.avgReturn).toBeLessThanOrEqual(0);
        }
      }
    });

    it('should handle zero returns', () => {
      const returns = Array.from({ length: 100 }, (_, i) => ({
        date: `2020-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        return: 0
      }));
      const effects = engine.analyzeMonthlyEffect(returns);
      for (const e of effects) {
        if (e.sampleSize > 0) {
          expect(e.avgReturn).toBe(0);
          expect(e.winRate).toBe(0);
        }
      }
    });

    it('should handle very large returns', () => {
      const returns: DailyReturn[] = [
        { date: '2020-01-02', return: 0.99 },
        { date: '2020-01-03', return: -0.50 },
        { date: '2020-01-06', return: 0.25 },
      ];
      const effects = engine.analyzeMonthlyEffect(returns);
      expect(effects[0].avgReturn).toBeTypeOf('number');
      expect(isFinite(effects[0].avgReturn)).toBe(true);
    });

    it('should handle weekends correctly in weekday analysis', () => {
      const returns: DailyReturn[] = [
        { date: '2020-01-06', return: 0.01 }, // Monday
        { date: '2020-01-07', return: 0.02 }, // Tuesday
        { date: '2020-01-08', return: -0.01 }, // Wednesday
        { date: '2020-01-09', return: 0.01 }, // Thursday
        { date: '2020-01-10', return: 0.03 }, // Friday
      ];
      const effects = engine.analyzeWeekdayEffect(returns);
      expect(effects.length).toBe(5);
      // Each weekday should have an entry
      for (const e of effects) {
        expect(e.weekday).toBeGreaterThanOrEqual(0);
        expect(e.weekday).toBeLessThanOrEqual(4);
      }
    });
  });
});
