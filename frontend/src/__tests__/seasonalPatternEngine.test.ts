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
  type SeasonalConfig,
} from '../utils/seasonalPatternEngine';

function makeMonthlyReturns(): MonthlyReturn[] {
  const data: MonthlyReturn[] = [];
  for (let year = 2016; year <= 2025; year++) {
    for (let month = 1; month <= 12; month++) {
      data.push({
        year,
        month,
        return: (Math.sin(month * 0.5) * 0.03) + (Math.random() - 0.5) * 0.04,
        volume: 1000000 + Math.random() * 500000,
        volatility: 0.01 + Math.random() * 0.02,
      });
    }
  }
  return data;
}

function makeDailyReturns() {
  const data: {
    date: string; return: number; volume: number; dayOfWeek: number;
    isBeforeHoliday: boolean; isAfterHoliday: boolean; holidayName: string;
  }[] = [];

  for (let i = 0; i < 250; i++) {
    const date = new Date(2025, 0, 1 + i);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;

    data.push({
      date: date.toISOString().split('T')[0],
      return: (Math.random() - 0.48) * 0.03,
      volume: 800000 + Math.random() * 400000,
      dayOfWeek: dow,
      isBeforeHoliday: i % 50 === 0,
      isAfterHoliday: i % 50 === 1,
      holidayName: i % 50 === 0 || i % 50 === 1 ? '春节' : '',
    });
  }
  return data;
}

describe('seasonalPatternEngine', () => {
  describe('analyzeMonthlyEffects', () => {
    it('should return 12 monthly analyses', () => {
      const returns = makeMonthlyReturns();
      const result = analyzeMonthlyEffects(returns);
      expect(result.length).toBe(12);
      expect(result[0].month).toBe(1);
      expect(result[11].month).toBe(12);
    });

    it('should include month names', () => {
      const returns = makeMonthlyReturns();
      const result = analyzeMonthlyEffects(returns);
      expect(result[0].monthName).toBe('一月');
      expect(result[11].monthName).toBe('十二月');
    });

    it('should calculate win rates', () => {
      const returns = makeMonthlyReturns();
      const result = analyzeMonthlyEffects(returns);
      for (const r of result) {
        expect(r.winRate).toBeGreaterThanOrEqual(0);
        expect(r.winRate).toBeLessThanOrEqual(1);
      }
    });

    it('should assign ranks 1-12', () => {
      const returns = makeMonthlyReturns();
      const result = analyzeMonthlyEffects(returns);
      const ranks = result.map(r => r.rank).sort((a, b) => a - b);
      expect(ranks.length).toBe(12);
      expect(ranks[0]).toBe(1);
      expect(ranks[11]).toBe(12);
    });

    it('should calculate consistency', () => {
      const returns = makeMonthlyReturns();
      const result = analyzeMonthlyEffects(returns);
      for (const r of result) {
        expect(r.consistency).toBeGreaterThanOrEqual(0);
        expect(r.consistency).toBeLessThanOrEqual(100);
      }
    });

    it('should compute best and worst years', () => {
      const returns = makeMonthlyReturns();
      const result = analyzeMonthlyEffects(returns);
      for (const r of result) {
        expect(r.bestYear.year).toBeGreaterThan(0);
        expect(r.bestYear.return).toBeGreaterThanOrEqual(r.worstYear.return);
      }
    });

    it('should calculate sharpe ratios', () => {
      const returns = makeMonthlyReturns();
      const result = analyzeMonthlyEffects(returns);
      for (const r of result) {
        expect(typeof r.sharpe).toBe('number');
      }
    });

    it('should handle empty data', () => {
      const result = analyzeMonthlyEffects([]);
      expect(result.length).toBe(0);
    });
  });

  describe('analyzeHolidayEffects', () => {
    it('should analyze holiday effects', () => {
      const daily = makeDailyReturns();
      const result = analyzeHolidayEffects(daily);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should include risk-reward ratio', () => {
      const daily = makeDailyReturns();
      const result = analyzeHolidayEffects(daily);
      for (const e of result) {
        expect(typeof e.riskReward).toBe('number');
      }
    });

    it('should include best entry day', () => {
      const daily = makeDailyReturns();
      const result = analyzeHolidayEffects(daily);
      for (const e of result) {
        expect(e.bestEntryDay).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeDayOfWeekEffect', () => {
    it('should return 5 weekday results', () => {
      const daily = makeDailyReturns();
      const result = analyzeDayOfWeekEffect(daily);
      expect(result.length).toBe(5);
    });

    it('should include correct day names', () => {
      const daily = makeDailyReturns();
      const result = analyzeDayOfWeekEffect(daily);
      expect(result[0].dayName).toBe('周一');
      expect(result[4].dayName).toBe('周五');
    });

    it('should have ranks 1-5', () => {
      const daily = makeDailyReturns();
      const result = analyzeDayOfWeekEffect(daily);
      const ranks = result.map(r => r.rank).sort();
      expect(ranks).toEqual([1, 2, 3, 4, 5]);
    });

    it('should calculate volume ratios', () => {
      const daily = makeDailyReturns();
      const result = analyzeDayOfWeekEffect(daily);
      for (const r of result) {
        expect(r.volumeRatio).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeEarningsSeasonEffect', () => {
    it('should return 4 quarterly effects', () => {
      const earningsData = [];
      for (let i = 0; i < 20; i++) {
        earningsData.push({
          period: `Q${(i % 4) + 1}` as 'Q1' | 'Q2' | 'Q3' | 'Q4',
          preReturn: Math.random() * 0.05,
          postReturn: Math.random() * 0.05,
          actualEPS: 0.5 + Math.random() * 0.5,
          expectedEPS: 0.5,
        });
      }
      const result = analyzeEarningsSeasonEffect(earningsData);
      expect(result.length).toBe(4);
    });

    it('should calculate beat rates', () => {
      const earningsData = [
        { period: 'Q1' as const, preReturn: 0.02, postReturn: 0.03, actualEPS: 0.6, expectedEPS: 0.5 },
        { period: 'Q1' as const, preReturn: 0.01, postReturn: -0.01, actualEPS: 0.4, expectedEPS: 0.5 },
      ];
      const result = analyzeEarningsSeasonEffect(earningsData);
      const q1 = result.find(r => r.period === 'Q1')!;
      expect(q1.beatRate).toBe(0.5);
    });

    it('should provide optimal strategy', () => {
      const earningsData = [
        { period: 'Q1' as const, preReturn: 0.02, postReturn: 0.03, actualEPS: 0.6, expectedEPS: 0.5 },
      ];
      const result = analyzeEarningsSeasonEffect(earningsData);
      for (const r of result) {
        expect(typeof r.optimalStrategy).toBe('string');
        expect(r.optimalStrategy.length).toBeGreaterThan(0);
      }
    });
  });

  describe('identifySeasonalPatterns', () => {
    it('should identify patterns', () => {
      const returns = makeMonthlyReturns();
      const patterns = identifySeasonalPatterns(returns);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should have significance info', () => {
      const returns = makeMonthlyReturns();
      const patterns = identifySeasonalPatterns(returns);
      for (const p of patterns) {
        expect(typeof p.significance).toBe('number');
        expect(typeof p.isSignificant).toBe('boolean');
      }
    });

    it('should include sample sizes', () => {
      const returns = makeMonthlyReturns();
      const patterns = identifySeasonalPatterns(returns);
      for (const p of patterns) {
        expect(p.sampleSize).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateSeasonalityScore', () => {
    it('should return score 0-100', () => {
      const returns = makeMonthlyReturns();
      const monthly = analyzeMonthlyEffects(returns);
      const holiday = [{ name: '春节', daysBeforeHoliday: 10, avgReturnBefore: 0.01, winRateBefore: 0.6, avgReturnAfter: 0.02, winRateAfter: 0.7, bestEntryDay: 3, avgHoldingReturn: 0.03, riskReward: 2 }];
      const score = calculateSeasonalityScore(monthly, holiday, 3, 15);
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(100);
    });

    it('should have valid recommendation', () => {
      const returns = makeMonthlyReturns();
      const monthly = analyzeMonthlyEffects(returns);
      const score = calculateSeasonalityScore(monthly, [], 1, 30);
      expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(score.recommendation);
    });

    it('should include details', () => {
      const returns = makeMonthlyReturns();
      const monthly = analyzeMonthlyEffects(returns);
      const score = calculateSeasonalityScore(monthly, [], 6, 100);
      expect(Array.isArray(score.details)).toBe(true);
    });
  });

  describe('generateSeasonalForecast', () => {
    it('should generate forecast', () => {
      const returns = makeMonthlyReturns();
      const monthly = analyzeMonthlyEffects(returns);
      const patterns = identifySeasonalPatterns(returns);
      const forecast = generateSeasonalForecast(patterns, 3, monthly);
      expect(forecast.forecastPeriod).toBe('3月');
      expect(typeof forecast.expectedReturn).toBe('number');
      expect(typeof forecast.confidence).toBe('number');
    });

    it('should include driving factors', () => {
      const returns = makeMonthlyReturns();
      const monthly = analyzeMonthlyEffects(returns);
      const patterns = identifySeasonalPatterns(returns);
      const forecast = generateSeasonalForecast(patterns, 3, monthly);
      expect(Array.isArray(forecast.drivingFactors)).toBe(true);
    });

    it('should include recommended action', () => {
      const returns = makeMonthlyReturns();
      const monthly = analyzeMonthlyEffects(returns);
      const patterns = identifySeasonalPatterns(returns);
      const forecast = generateSeasonalForecast(patterns, 10, monthly);
      expect(typeof forecast.recommendedAction).toBe('string');
      expect(forecast.recommendedAction.length).toBeGreaterThan(0);
    });
  });

  describe('runSeasonalAnalysis', () => {
    it('should return complete analysis', () => {
      const monthly = makeMonthlyReturns();
      const daily = makeDailyReturns();
      const result = runSeasonalAnalysis(monthly, daily, 3, 10);
      expect(result.monthlyEffects.length).toBe(12);
      expect(result.dayOfWeekEffects.length).toBe(5);
      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.score).toBeDefined();
      expect(result.forecast).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should identify best and worst months', () => {
      const monthly = makeMonthlyReturns();
      const daily = makeDailyReturns();
      const result = runSeasonalAnalysis(monthly, daily, 3, 10);
      expect(result.summary.bestMonth).toBeDefined();
      expect(result.summary.worstMonth).toBeDefined();
    });

    it('should identify significant patterns', () => {
      const monthly = makeMonthlyReturns();
      const daily = makeDailyReturns();
      const result = runSeasonalAnalysis(monthly, daily, 3, 10);
      expect(Array.isArray(result.summary.significantPatterns)).toBe(true);
    });
  });

  describe('constants', () => {
    it('should have Chinese holidays defined', () => {
      expect(CHINESE_HOLIDAYS.length).toBeGreaterThan(0);
      expect(CHINESE_HOLIDAYS[0].name).toBe('春节');
    });

    it('should have 24 solar terms', () => {
      expect(SOLAR_TERMS.length).toBe(24);
      expect(SOLAR_TERMS[0]).toBe('小寒');
      expect(SOLAR_TERMS[23]).toBe('冬至');
    });
  });
});
