/**
 * 行业对比分析页面逻辑测试
 * 覆盖行业估值对比、盈利排名、景气度
 */

import { describe, it, expect } from 'vitest';

describe('行业对比分析', () => {
  describe('行业估值对比', () => {
    interface IndustryValuation {
      name: string;
      pe: number;
      pb: number;
      ps: number;
      dividendYield: number;
    }

    function rankByValuation(industries: IndustryValuation[], metric: keyof Omit<IndustryValuation, 'name'>, asc = true): IndustryValuation[] {
      return [...industries].sort((a, b) => asc ? a[metric] - b[metric] : b[metric] - a[metric]);
    }

    function calcValuationPercentile(industry: IndustryValuation, allIndustries: IndustryValuation[], metric: keyof Omit<IndustryValuation, 'name'>): number {
      const values = allIndustries.map(i => i[metric] as number).sort((a, b) => a - b);
      const rank = values.filter(v => v <= (industry[metric] as number)).length;
      return Math.round((rank / values.length) * 100);
    }

    it('应按PE升序排列', () => {
      const industries: IndustryValuation[] = [
        { name: '科技', pe: 40, pb: 5, ps: 8, dividendYield: 0.5 },
        { name: '银行', pe: 5, pb: 0.5, ps: 1, dividendYield: 5 },
        { name: '消费', pe: 25, pb: 4, ps: 3, dividendYield: 1.5 },
      ];
      const sorted = rankByValuation(industries, 'pe');
      expect(sorted[0].name).toBe('银行');
      expect(sorted[2].name).toBe('科技');
    });

    it('应正确计算估值分位数', () => {
      const all: IndustryValuation[] = [
        { name: 'A', pe: 10, pb: 1, ps: 1, dividendYield: 3 },
        { name: 'B', pe: 20, pb: 2, ps: 2, dividendYield: 2 },
        { name: 'C', pe: 30, pb: 3, ps: 3, dividendYield: 1 },
        { name: 'D', pe: 40, pb: 4, ps: 4, dividendYield: 0.5 },
      ];
      expect(calcValuationPercentile(all[0], all, 'pe')).toBe(25);
      expect(calcValuationPercentile(all[2], all, 'pe')).toBe(75);
    });
  });

  describe('行业盈利排名', () => {
    interface IndustryEarnings {
      name: string;
      revenueGrowth: number;
      profitGrowth: number;
      roe: number;
      margin: number;
    }

    function calcCompositeScore(earnings: IndustryEarnings): number {
      return Math.round(
        (earnings.revenueGrowth * 0.2 + earnings.profitGrowth * 0.3 +
         earnings.roe * 0.3 + earnings.margin * 0.2) * 100
      ) / 100;
    }

    function rankIndustries(industries: IndustryEarnings[]): { name: string; score: number; rank: number }[] {
      const scored = industries.map(i => ({ name: i.name, score: calcCompositeScore(i), rank: 0 }));
      scored.sort((a, b) => b.score - a.score);
      scored.forEach((s, i) => s.rank = i + 1);
      return scored;
    }

    it('应正确计算综合评分', () => {
      const earnings: IndustryEarnings = { name: '科技', revenueGrowth: 20, profitGrowth: 30, roe: 15, margin: 25 };
      const score = calcCompositeScore(earnings);
      expect(score).toBeGreaterThan(0);
    });

    it('应正确排名', () => {
      const industries: IndustryEarnings[] = [
        { name: 'A', revenueGrowth: 5, profitGrowth: 5, roe: 5, margin: 5 },
        { name: 'B', revenueGrowth: 20, profitGrowth: 30, roe: 15, margin: 20 },
        { name: 'C', revenueGrowth: 10, profitGrowth: 10, roe: 10, margin: 10 },
      ];
      const ranked = rankIndustries(industries);
      expect(ranked[0].name).toBe('B');
      expect(ranked[2].name).toBe('A');
    });
  });

  describe('景气度跟踪', () => {
    interface ProsperityData {
      month: string;
      pm: number;
      industrialOutput: number;
      retailSales: number;
    }

    function calcProsperityIndex(data: ProsperityData[]): { index: number; trend: 'up' | 'down' | 'stable' } {
      if (data.length === 0) return { index: 50, trend: 'stable' };

      const latest = data[data.length - 1];
      const index = (latest.pm + latest.industrialOutput + latest.retailSales) / 3;

      if (data.length < 2) return { index: Math.round(index * 100) / 100, trend: 'stable' };

      const prev = data[data.length - 2];
      const prevIndex = (prev.pm + prev.industrialOutput + prev.retailSales) / 3;

      return {
        index: Math.round(index * 100) / 100,
        trend: index > prevIndex + 0.5 ? 'up' : index < prevIndex - 0.5 ? 'down' : 'stable',
      };
    }

    it('应正确计算景气度指数', () => {
      const data: ProsperityData[] = [
        { month: '2024-01', pm: 50, industrialOutput: 5, retailSales: 8 },
        { month: '2024-02', pm: 52, industrialOutput: 6, retailSales: 9 },
      ];
      const result = calcProsperityIndex(data);
      expect(result.trend).toBe('up');
      expect(result.index).toBeCloseTo(22.33, 0);
    });
  });

  describe('行业轮动信号', () => {
    function detectRotationSignal(momentum: { w1: number; w2: number; m1: number; m3: number }): {
      signal: 'leading' | 'lagging' | 'recovering' | 'weakening';
    } {
      if (momentum.w1 > 3 && momentum.m1 > 5) return { signal: 'leading' };
      if (momentum.w1 < -3 && momentum.m1 < -5) return { signal: 'lagging' };
      if (momentum.w1 > 0 && momentum.m1 < 0) return { signal: 'recovering' };
      if (momentum.w1 < 0 && momentum.m1 > 0) return { signal: 'weakening' };
      return { signal: 'leading' };
    }

    it('短期强势中期强势应为领涨', () => {
      expect(detectRotationSignal({ w1: 5, w2: 3, m1: 8, m3: 10 }).signal).toBe('leading');
    });

    it('短期转正中期为负应为复苏', () => {
      expect(detectRotationSignal({ w1: 2, w2: 1, m1: -3, m3: -5 }).signal).toBe('recovering');
    });
  });
});
