import { describe, it, expect } from 'vitest';

/**
 * 季节性模式引擎测试
 */

interface DailyReturn {
  date: string;
  return: number;
  volume: number;
}

function analyzeMonthlyEffects(returns: DailyReturn[]): Array<{ month: number; avgReturn: number; winRate: number; bestYear: number; worstYear: number }> {
  const grouped: Record<number, number[]> = {};
  const yearGroups: Record<number, Record<number, number[]>> = {};
  returns.forEach(r => {
    const d = new Date(r.date);
    const m = d.getMonth();
    const y = d.getFullYear();
    if (!grouped[m]) grouped[m] = [];
    grouped[m].push(r.return);
    if (!yearGroups[y]) yearGroups[y] = {};
    if (!yearGroups[y][m]) yearGroups[y][m] = [];
    yearGroups[y][m].push(r.return);
  });
  return Array.from({ length: 12 }, (_, m) => {
    const rets = grouped[m] || [];
    const avg = rets.length > 0 ? rets.reduce((s, v) => s + v, 0) / rets.length : 0;
    const wins = rets.filter(r => r > 0).length;
    const yearlyAvgs = Object.entries(yearGroups).map(([y, months]) => {
      const mr = months[m] || [];
      return mr.length > 0 ? mr.reduce((s, v) => s + v, 0) / mr.length : 0;
    });
    return {
      month: m + 1,
      avgReturn: parseFloat(avg.toFixed(6)),
      winRate: rets.length > 0 ? parseFloat((wins / rets.length).toFixed(4)) : 0,
      bestYear: yearlyAvgs.length > 0 ? Math.max(...yearlyAvgs) : 0,
      worstYear: yearlyAvgs.length > 0 ? Math.min(...yearlyAvgs) : 0,
    };
  });
}

function analyzeDayOfWeekEffect(returns: DailyReturn[]): Array<{ day: number; name: string; avgReturn: number; winRate: number }> {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const grouped: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  returns.forEach(r => {
    const d = new Date(r.date).getDay();
    if (d >= 1 && d <= 5) grouped[d - 1].push(r.return);
  });
  return Object.entries(grouped).map(([day, rets]) => {
    const avg = rets.length > 0 ? rets.reduce((s, v) => s + v, 0) / rets.length : 0;
    const wins = rets.filter(r => r > 0).length;
    return { day: Number(day), name: days[Number(day)], avgReturn: parseFloat(avg.toFixed(6)), winRate: rets.length > 0 ? parseFloat((wins / rets.length).toFixed(4)) : 0 };
  });
}

function calculateSeasonalityScore(monthlyEffects: Array<{ month: number; avgReturn: number; winRate: number }>): number {
  if (monthlyEffects.length === 0) return 0;
  const consistency = monthlyEffects.reduce((s, m) => s + (m.winRate > 0.5 ? 1 : 0), 0) / monthlyEffects.length;
  const magnitude = monthlyEffects.reduce((s, m) => s + Math.abs(m.avgReturn), 0) / monthlyEffects.length;
  return parseFloat((consistency * 50 + Math.min(50, magnitude * 10000)).toFixed(2));
}

describe('季节性模式引擎', () => {
  const generateReturns = (n: number): DailyReturn[] =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(2024, 0, 1 + i);
      return { date: d.toISOString().split('T')[0], return: (Math.random() - 0.48) * 0.03, volume: 1000000 };
    });

  describe('analyzeMonthlyEffects', () => {
    it('should return 12 months', () => {
      const effects = analyzeMonthlyEffects(generateReturns(365));
      expect(effects).toHaveLength(12);
    });

    it('should have valid win rates', () => {
      const effects = analyzeMonthlyEffects(generateReturns(365));
      effects.forEach(m => {
        expect(m.winRate).toBeGreaterThanOrEqual(0);
        expect(m.winRate).toBeLessThanOrEqual(1);
      });
    });

    it('should handle empty returns', () => {
      const effects = analyzeMonthlyEffects([]);
      expect(effects).toHaveLength(12);
      effects.forEach(m => expect(m.avgReturn).toBe(0));
    });
  });

  describe('analyzeDayOfWeekEffect', () => {
    it('should return 5 weekdays', () => {
      const effects = analyzeDayOfWeekEffect(generateReturns(100));
      expect(effects).toHaveLength(5);
    });

    it('should skip weekends', () => {
      const returns: DailyReturn[] = [
        { date: '2024-01-01', return: 0.01, volume: 100 }, // Mon
        { date: '2024-01-06', return: 0.02, volume: 100 }, // Sat
        { date: '2024-01-07', return: 0.03, volume: 100 }, // Sun
      ];
      const effects = analyzeDayOfWeekEffect(returns);
      expect(effects[0].avgReturn).toBe(0.01); // Monday only
      expect(effects[4].avgReturn).toBe(0); // Friday has no data
    });
  });

  describe('calculateSeasonalityScore', () => {
    it('should return 0 for empty', () => {
      expect(calculateSeasonalityScore([])).toBe(0);
    });

    it('should be between 0 and 100', () => {
      const effects = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, avgReturn: Math.random() * 0.01, winRate: 0.5 + Math.random() * 0.3 }));
      const score = calculateSeasonalityScore(effects);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});
