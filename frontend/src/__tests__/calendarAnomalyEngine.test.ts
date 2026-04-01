import { describe, it, expect } from 'vitest';

/**
 * 日历异象引擎测试
 */

interface DailyReturn {
  date: string;
  return: number;
  volume: number;
}

interface CalendarEffect {
  name: string;
  avgReturn: number;
  winRate: number;
  sampleSize: number;
  significance: 'high' | 'medium' | 'low' | 'none';
}

function calculateEffect(returns: number[]): { avgReturn: number; winRate: number; tStat: number } {
  if (returns.length === 0) return { avgReturn: 0, winRate: 0, tStat: 0 };
  const avg = returns.reduce((s, v) => s + v, 0) / returns.length;
  const wins = returns.filter(r => r > 0).length;
  const winRate = wins / returns.length;
  const variance = returns.reduce((s, v) => s + (v - avg) ** 2, 0) / Math.max(1, returns.length - 1);
  const std = Math.sqrt(variance);
  const tStat = std > 0 ? avg / (std / Math.sqrt(returns.length)) : 0;
  return { avgReturn: parseFloat(avg.toFixed(6)), winRate: parseFloat(winRate.toFixed(4)), tStat: parseFloat(tStat.toFixed(4)) };
}

function dayOfWeekEffect(returns: DailyReturn[]): Array<{ day: number; name: string; avgReturn: number; winRate: number }> {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const grouped: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  returns.forEach(r => {
    const d = new Date(r.date).getDay();
    if (d >= 1 && d <= 5) grouped[d - 1].push(r.return);
  });
  return Object.entries(grouped).map(([day, rets]) => {
    const eff = calculateEffect(rets);
    return { day: Number(day), name: days[Number(day)], avgReturn: eff.avgReturn, winRate: eff.winRate };
  });
}

function monthEffect(returns: DailyReturn[]): Array<{ month: number; avgReturn: number; winRate: number }> {
  const grouped: Record<number, number[]> = {};
  returns.forEach(r => {
    const m = new Date(r.date).getMonth();
    if (!grouped[m]) grouped[m] = [];
    grouped[m].push(r.return);
  });
  return Array.from({ length: 12 }, (_, i) => {
    const rets = grouped[i] || [];
    const eff = calculateEffect(rets);
    return { month: i + 1, avgReturn: eff.avgReturn, winRate: eff.winRate };
  });
}

function turnOfMonthEffect(returns: DailyReturn[]): { start: number; mid: number; end: number } {
  const start: number[] = [], mid: number[] = [], end: number[] = [];
  returns.forEach(r => {
    const day = new Date(r.date).getDate();
    if (day <= 5) start.push(r.return);
    else if (day <= 20) mid.push(r.return);
    else end.push(r.return);
  });
  return {
    start: calculateEffect(start).avgReturn,
    mid: calculateEffect(mid).avgReturn,
    end: calculateEffect(end).avgReturn,
  };
}

describe('日历异象引擎', () => {
  const generateReturns = (n: number): DailyReturn[] =>
    Array.from({ length: n }, (_, i) => ({
      date: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      return: (Math.random() - 0.48) * 0.03,
      volume: Math.floor(Math.random() * 10000000),
    }));

  describe('calculateEffect', () => {
    it('should handle empty array', () => {
      expect(calculateEffect([])).toEqual({ avgReturn: 0, winRate: 0, tStat: 0 });
    });

    it('should calculate average return', () => {
      expect(calculateEffect([0.01, 0.02, -0.01]).avgReturn).toBeCloseTo(0.0067, 3);
    });

    it('should calculate win rate', () => {
      expect(calculateEffect([0.01, -0.01, 0.02, -0.02]).winRate).toBe(0.5);
    });

    it('should return 100% win rate for all positive', () => {
      expect(calculateEffect([0.01, 0.02, 0.03]).winRate).toBe(1);
    });
  });

  describe('dayOfWeekEffect', () => {
    it('should return 5 days', () => {
      const effect = dayOfWeekEffect(generateReturns(100));
      expect(effect).toHaveLength(5);
    });

    it('each day should have valid metrics', () => {
      const effect = dayOfWeekEffect(generateReturns(200));
      effect.forEach(d => {
        expect(d.winRate).toBeGreaterThanOrEqual(0);
        expect(d.winRate).toBeLessThanOrEqual(1);
        expect(d.name).toBeTruthy();
      });
    });
  });

  describe('monthEffect', () => {
    it('should return 12 months', () => {
      const effect = monthEffect(generateReturns(365));
      expect(effect).toHaveLength(12);
    });

    it('months should be numbered 1-12', () => {
      const effect = monthEffect(generateReturns(365));
      effect.forEach((m, i) => {
        expect(m.month).toBe(i + 1);
      });
    });
  });

  describe('turnOfMonthEffect', () => {
    it('should return start/mid/end periods', () => {
      const effect = turnOfMonthEffect(generateReturns(300));
      expect(typeof effect.start).toBe('number');
      expect(typeof effect.mid).toBe('number');
      expect(typeof effect.end).toBe('number');
    });
  });
});
