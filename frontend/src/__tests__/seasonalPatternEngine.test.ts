import { describe, it, expect } from 'vitest';
import {
  analyzeMonthlyEffects,
  analyzeHolidayEffects,
  analyzeDayOfWeekEffect,
  analyzeEarningsSeasonEffect,
  identifySeasonalPatterns,
  calculateSeasonalityScore,
  generateSeasonalForecast,
  runSeasonalAnalysis,
  CHINESE_HOLIDAYS,
  SOLAR_TERMS,
  type MonthlyReturn,
  type HolidayEffect
} from '../utils/seasonalPatternEngine';

/**
 * 季节性模式引擎测试（导入真实模块）
 * 使用确定性数据驱动真实逻辑，不依赖 Math.random 假数据。
 */

// 固定的 12 个月收益（每年相同），用于可预测的断言
const MONTH_RETURNS = [
  0.05, 0.03, -0.02, 0.01, -0.04, -0.03, 0.06, 0.02, 0.04, 0.03, -0.01, 0.02,
];

function makeMonthlyReturns(years: number[]): MonthlyReturn[] {
  const arr: MonthlyReturn[] = [];
  for (const year of years) {
    for (let m = 1; m <= 12; m++) {
      arr.push({ year, month: m, return: MONTH_RETURNS[m - 1], volume: 1000, volatility: 0.1 });
    }
  }
  return arr;
}

describe('SeasonalPatternEngine (real module)', () => {
  describe('constants', () => {
    it('should define 7 Chinese holidays', () => {
      expect(CHINESE_HOLIDAYS).toHaveLength(7);
    });
    it('should define 24 solar terms', () => {
      expect(SOLAR_TERMS).toHaveLength(24);
    });
  });

  describe('analyzeMonthlyEffects', () => {
    it('should return one entry per month with data', () => {
      const effects = analyzeMonthlyEffects(makeMonthlyReturns([2020, 2021, 2022, 2023, 2024]));
      expect(effects).toHaveLength(12);
    });

    it('should compute valid win rates', () => {
      const effects = analyzeMonthlyEffects(makeMonthlyReturns([2020, 2021, 2022]));
      effects.forEach(m => {
        expect(m.winRate).toBeGreaterThanOrEqual(0);
        expect(m.winRate).toBeLessThanOrEqual(1);
        expect(m.monthName).toBeTruthy();
        expect(m.rank).toBeGreaterThanOrEqual(1);
      });
    });

    it('should compute predictable avgReturn for January', () => {
      const effects = analyzeMonthlyEffects(makeMonthlyReturns([2020, 2021, 2022, 2023, 2024]));
      const jan = effects.find(m => m.month === 1)!;
      expect(jan.avgReturn).toBeCloseTo(0.05, 4);
      expect(jan.isPositive).toBe(true);
    });

    it('should return empty for no returns', () => {
      expect(analyzeMonthlyEffects([])).toHaveLength(0);
    });
  });

  describe('analyzeDayOfWeekEffect', () => {
    const daily = (dayOfWeek: number, ret: number) => ({
      date: '2024-01-01', return: ret, volume: 100, dayOfWeek,
    });

    it('should return 5 weekdays when all provided', () => {
      const data = [1, 2, 3, 4, 5].map(d => daily(d, 0.01 * d));
      expect(analyzeDayOfWeekEffect(data)).toHaveLength(5);
    });

    it('should skip weekends (dayOfWeek 0 and 6)', () => {
      const data = [daily(1, 0.01), daily(6, 0.99), daily(0, 0.99)];
      const effects = analyzeDayOfWeekEffect(data);
      expect(effects).toHaveLength(1);
      expect(effects[0].dayOfWeek).toBe(1);
      expect(effects[0].avgReturn).toBeCloseTo(0.01, 4);
      expect(effects[0].dayName).toBe('周一');
    });
  });

  describe('analyzeHolidayEffects', () => {
    it('should aggregate before/after returns per holiday', () => {
      const data = [
        { date: '2024-02-01', return: 0.02, isBeforeHoliday: true, isAfterHoliday: false, holidayName: '春节' },
        { date: '2024-02-02', return: 0.03, isBeforeHoliday: true, isAfterHoliday: false, holidayName: '春节' },
        { date: '2024-02-15', return: 0.01, isBeforeHoliday: false, isAfterHoliday: true, holidayName: '春节' },
      ];
      const effects: HolidayEffect[] = analyzeHolidayEffects(data);
      expect(effects).toHaveLength(1);
      expect(effects[0].name).toBe('春节');
      expect(effects[0].avgReturnBefore).toBeCloseTo(0.025, 4);
      expect(effects[0].avgReturnAfter).toBeCloseTo(0.01, 4);
      expect(effects[0].bestEntryDay).toBe(1);
    });

    it('should ignore entries without a holiday name', () => {
      const data = [{ date: '2024-02-01', return: 0.02, isBeforeHoliday: true, isAfterHoliday: false, holidayName: '' }];
      expect(analyzeHolidayEffects(data)).toHaveLength(0);
    });
  });

  describe('analyzeEarningsSeasonEffect', () => {
    const earnings = [
      { period: 'Q1' as const, preReturn: 0.03, postReturn: 0.05, actualEPS: 1.2, expectedEPS: 1.0 },
      { period: 'Q2' as const, preReturn: -0.01, postReturn: 0.005, actualEPS: 0.9, expectedEPS: 1.0 },
      { period: 'Q3' as const, preReturn: 0.02, postReturn: 0.04, actualEPS: 1.1, expectedEPS: 1.0 },
    ];

    it('should produce one result per quarter', () => {
      const res = analyzeEarningsSeasonEffect(earnings);
      expect(res.map(r => r.period)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    });

    it('should recommend pre-earnings layout for beats', () => {
      const res = analyzeEarningsSeasonEffect(earnings);
      expect(res[0].beatRate).toBe(1);
      expect(res[0].optimalStrategy).toBe('财报前布局超预期个股');
    });

    it('should mark missing quarters as insufficient', () => {
      const res = analyzeEarningsSeasonEffect(earnings);
      expect(res[3].optimalStrategy).toBe('数据不足');
    });
  });

  describe('identifySeasonalPatterns', () => {
    it('should detect the classic monthly patterns', () => {
      const patterns = identifySeasonalPatterns(makeMonthlyReturns([2020, 2021, 2022, 2023, 2024]));
      const names = patterns.map(p => p.name);
      expect(names).toContain('一月效应');
      expect(names).toContain('五穷六绝七翻身');
      expect(names).toContain('金九银十');
      expect(names).toContain('年末效应');
      expect(names).toContain('春季躁动');
    });

    it('should mark May-July turn and January as significant', () => {
      const patterns = identifySeasonalPatterns(makeMonthlyReturns([2020, 2021, 2022, 2023, 2024]));
      const mayJul = patterns.find(p => p.name === '五穷六绝七翻身')!;
      expect(mayJul.isSignificant).toBe(true);
      const jan = patterns.find(p => p.name === '一月效应')!;
      expect(jan.isSignificant).toBe(true);
    });
  });

  describe('calculateSeasonalityScore', () => {
    it('should produce a clamped 0-100 score and recommendation', () => {
      const monthly = analyzeMonthlyEffects(makeMonthlyReturns([2020, 2021, 2022, 2023, 2024]));
      const holiday = analyzeHolidayEffects([
        { date: '2024-02-01', return: 0.025, isBeforeHoliday: true, isAfterHoliday: false, holidayName: '春节' },
      ]);
      const score = calculateSeasonalityScore(monthly, holiday, 1, 5);
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(100);
      expect(score.monthly).toBeLessThanOrEqual(100);
      expect(score.holiday).toBeLessThanOrEqual(100);
      expect(score.recommendation).toBe('strong_buy');
    });
  });

  describe('generateSeasonalForecast', () => {
    it('should forecast for the current month using relevant patterns', () => {
      const patterns = identifySeasonalPatterns(makeMonthlyReturns([2020, 2021, 2022, 2023, 2024]));
      const forecast = generateSeasonalForecast(patterns, 1, []);
      expect(forecast.forecastPeriod).toBe('1月');
      expect(forecast.expectedReturn).toBeCloseTo(0.05, 4);
      expect(forecast.patterns).toHaveLength(1); // only 一月效应 relevant in Jan
      expect(forecast.recommendedAction).toBe('积极做多，适当加仓');
    });
  });

  describe('runSeasonalAnalysis (integration)', () => {
    it('should return a full analysis with summary', () => {
      const monthly = makeMonthlyReturns([2020, 2021, 2022, 2023, 2024]);
      const daily = [
        { date: '2024-02-01', return: 0.02, volume: 100, dayOfWeek: 1, isBeforeHoliday: true, isAfterHoliday: false, holidayName: '春节' },
        { date: '2024-02-15', return: 0.01, volume: 100, dayOfWeek: 5, isBeforeHoliday: false, isAfterHoliday: true, holidayName: '春节' },
      ];
      const result = runSeasonalAnalysis(monthly, daily, 1, 5);
      expect(result.monthlyEffects).toHaveLength(12);
      expect(result.dayOfWeekEffects.length).toBeGreaterThan(0);
      expect(result.holidayEffects).toHaveLength(1);
      expect(result.summary.bestMonth.month).toBe(7); // July has the highest fixed return
      expect(result.summary.significantPatterns.length).toBeGreaterThan(0);
      expect(result.score.overall).toBeGreaterThanOrEqual(0);
    });
  });
});
