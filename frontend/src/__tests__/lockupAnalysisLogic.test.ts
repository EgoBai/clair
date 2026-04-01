/**
 * 限售股解禁分析逻辑测试
 * 覆盖解禁规模估算、压力指数、历史统计
 */

import { describe, it, expect } from 'vitest';

describe('限售股解禁分析', () => {
  describe('解禁压力指数', () => {
    function calcPressureIndex(event: {
      unlockShares: number;
      totalShares: number;
      avgDailyVolume: number;
      currentPrice: number;
    }): { index: number; level: 'extreme' | 'high' | 'medium' | 'low' } {
      const supplyRatio = event.unlockShares / event.totalShares;
      const daysToAbsorb = event.unlockShares / event.avgDailyVolume;
      const valuePressure = (event.unlockShares * event.currentPrice) / 1e8; // 亿元

      const index = Math.round((supplyRatio * 40 + daysToAbsorb * 0.5 + valuePressure * 0.1) * 100) / 100;

      let level: 'extreme' | 'high' | 'medium' | 'low' = 'low';
      if (index > 50) level = 'extreme';
      else if (index > 20) level = 'high';
      else if (index > 5) level = 'medium';

      return { index, level };
    }

    it('大规模解禁应为极端压力', () => {
      const result = calcPressureIndex({
        unlockShares: 1e9, totalShares: 2e9, avgDailyVolume: 1e6, currentPrice: 10,
      });
      expect(result.level).toBe('extreme');
    });

    it('小规模解禁应为低压力', () => {
      const result = calcPressureIndex({
        unlockShares: 1e6, totalShares: 1e10, avgDailyVolume: 5e7, currentPrice: 10,
      });
      expect(result.level).toBe('low');
    });
  });

  describe('月度解禁统计', () => {
    interface MonthlyUnlock {
      month: string;
      totalValue: number;
      stockCount: number;
      avgUnlockRatio: number;
    }

    function aggregateMonthly(events: { month: string; value: number; ratio: number }[]): MonthlyUnlock[] {
      const map = new Map<string, { totalValue: number; stockCount: number; totalRatio: number }>();
      for (const e of events) {
        if (!map.has(e.month)) map.set(e.month, { totalValue: 0, stockCount: 0, totalRatio: 0 });
        const agg = map.get(e.month)!;
        agg.totalValue += e.value;
        agg.stockCount += 1;
        agg.totalRatio += e.ratio;
      }
      return Array.from(map.entries())
        .map(([month, agg]) => ({
          month,
          totalValue: agg.totalValue,
          stockCount: agg.stockCount,
          avgUnlockRatio: Math.round((agg.totalRatio / agg.stockCount) * 100) / 100,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
    }

    it('应正确按月聚合', () => {
      const events = [
        { month: '2024-01', value: 1e9, ratio: 10 },
        { month: '2024-01', value: 2e9, ratio: 20 },
        { month: '2024-02', value: 5e8, ratio: 5 },
      ];
      const result = aggregateMonthly(events);
      expect(result).toHaveLength(2);
      expect(result[0].totalValue).toBe(3e9);
      expect(result[0].stockCount).toBe(2);
      expect(result[0].avgUnlockRatio).toBe(15);
    });
  });

  describe('解禁类型分布', () => {
    function calcTypeDistribution(events: { type: string }[]): Record<string, number> {
      const dist: Record<string, number> = {};
      for (const e of events) {
        dist[e.type] = (dist[e.type] || 0) + 1;
      }
      return dist;
    }

    it('应正确统计类型分布', () => {
      const events = [
        { type: 'ipo' }, { type: 'ipo' }, { type: 'placement' }, { type: 'ipo' },
      ];
      const dist = calcTypeDistribution(events);
      expect(dist['ipo']).toBe(3);
      expect(dist['placement']).toBe(1);
    });
  });

  describe('解禁前后价格影响', () => {
    function analyzePriceImpact(prices: number[], unlockDay: number): {
      preUnlockChange: number;
      postUnlockChange: number;
      maxDrawdown: number;
    } {
      const pre = prices.slice(Math.max(0, unlockDay - 5), unlockDay);
      const post = prices.slice(unlockDay, unlockDay + 5);
      const preUnlockChange = pre.length >= 2 ? ((pre[pre.length - 1] - pre[0]) / pre[0]) * 100 : 0;
      const postUnlockChange = post.length >= 2 ? ((post[post.length - 1] - post[0]) / post[0]) * 100 : 0;

      let maxDrawdown = 0;
      if (post.length > 0) {
        let peak = post[0];
        for (const p of post) {
          if (p > peak) peak = p;
          const dd = (peak - p) / peak;
          if (dd > maxDrawdown) maxDrawdown = dd;
        }
      }

      return {
        preUnlockChange: Math.round(preUnlockChange * 100) / 100,
        postUnlockChange: Math.round(postUnlockChange * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
      };
    }

    it('应正确计算解禁前后影响', () => {
      const prices = [10, 10.5, 10.2, 10, 9.8, 9.5, 9.3, 9.8, 10, 10.2];
      const result = analyzePriceImpact(prices, 5);
      expect(result.preUnlockChange).toBe(-2); // 10 -> 9.8
      expect(result.postUnlockChange).toBeCloseTo(7.37, 0); // 9.5 -> 10.2
    });
  });
});
