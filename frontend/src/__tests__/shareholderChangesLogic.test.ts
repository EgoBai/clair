/**
 * 首富榜/股东变化页面逻辑测试
 * 覆盖股东变动分析、筹码分布、增减持
 */

import { describe, it, expect } from 'vitest';

describe('股东变化页面逻辑', () => {
  describe('股东增减持分析', () => {
    interface ShareholderChange {
      name: string;
      prevShares: number;
      currShares: number;
      changeType: 'increase' | 'decrease' | 'new' | 'exit';
    }

    function analyzeChanges(changes: ShareholderChange[]): {
      totalIncreased: number;
      totalDecreased: number;
      newShareholders: number;
      exitedShareholders: number;
      netChange: number;
    } {
      let totalIncreased = 0, totalDecreased = 0;
      let newCount = 0, exitCount = 0;

      for (const c of changes) {
        const diff = c.currShares - c.prevShares;
        if (diff > 0) totalIncreased += diff;
        else if (diff < 0) totalDecreased += Math.abs(diff);
        if (c.changeType === 'new') newCount++;
        if (c.changeType === 'exit') exitCount++;
      }

      return {
        totalIncreased,
        totalDecreased,
        newShareholders: newCount,
        exitedShareholders: exitCount,
        netChange: totalIncreased - totalDecreased,
      };
    }

    it('应正确汇总增减持', () => {
      const changes: ShareholderChange[] = [
        { name: 'A', prevShares: 1000, currShares: 1500, changeType: 'increase' },
        { name: 'B', prevShares: 2000, currShares: 1000, changeType: 'decrease' },
        { name: 'C', prevShares: 0, currShares: 500, changeType: 'new' },
      ];
      const result = analyzeChanges(changes);
      expect(result.totalIncreased).toBe(1000); // 500 + 500
      expect(result.totalDecreased).toBe(1000);
      expect(result.newShareholders).toBe(1);
    });
  });

  describe('十大股东占比', () => {
    function calcTop10Ratio(top10Shares: number, totalShares: number): {
      ratio: number;
      concentration: 'high' | 'medium' | 'low';
    } {
      const ratio = totalShares > 0 ? Math.round((top10Shares / totalShares) * 10000) / 100 : 0;
      let concentration: 'high' | 'medium' | 'low' = 'low';
      if (ratio > 60) concentration = 'high';
      else if (ratio > 30) concentration = 'medium';
      return { ratio, concentration };
    }

    it('高占比应为high', () => {
      expect(calcTop10Ratio(7e8, 1e9).concentration).toBe('high');
    });

    it('低占比应为low', () => {
      expect(calcTop10Ratio(1e8, 1e9).concentration).toBe('low');
    });
  });

  describe('机构持仓变化', () => {
    interface InstitutionalHolding {
      institution: string;
      type: 'fund' | 'insurance' | 'qfii' | 'social_security';
      shares: number;
      changeFromPrev: number;
    }

    function analyzeInstitutional(holdings: InstitutionalHolding[]): {
      byType: Record<string, { count: number; totalShares: number; netChange: number }>;
      totalInstitutions: number;
      totalNetChange: number;
    } {
      const byType: Record<string, { count: number; totalShares: number; netChange: number }> = {};
      let totalNetChange = 0;

      for (const h of holdings) {
        if (!byType[h.type]) byType[h.type] = { count: 0, totalShares: 0, netChange: 0 };
        byType[h.type].count++;
        byType[h.type].totalShares += h.shares;
        byType[h.type].netChange += h.changeFromPrev;
        totalNetChange += h.changeFromPrev;
      }

      return { byType, totalInstitutions: holdings.length, totalNetChange };
    }

    it('应按类型统计', () => {
      const holdings: InstitutionalHolding[] = [
        { institution: '基金A', type: 'fund', shares: 1e6, changeFromPrev: 1e5 },
        { institution: '基金B', type: 'fund', shares: 2e6, changeFromPrev: -5e4 },
        { institution: '保险A', type: 'insurance', shares: 5e5, changeFromPrev: 2e4 },
      ];
      const result = analyzeInstitutional(holdings);
      expect(result.byType['fund'].count).toBe(2);
      expect(result.byType['fund'].netChange).toBe(50000);
      expect(result.totalInstitutions).toBe(3);
    });
  });

  describe('筹码分布估算', () => {
    function estimateChipDistribution(prices: number[], volumes: number[]): { price: number; volume: number; percent: number }[] {
      if (prices.length !== volumes.length || prices.length === 0) return [];
      const totalVolume = volumes.reduce((s, v) => s + v, 0);
      if (totalVolume === 0) return [];

      // Group by price ranges
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const step = (max - min) / 10 || 1;
      const bins = new Map<number, number>();

      for (let i = 0; i < prices.length; i++) {
        const binKey = Math.floor((prices[i] - min) / step) * step + min;
        bins.set(binKey, (bins.get(binKey) || 0) + volumes[i]);
      }

      return Array.from(bins.entries())
        .map(([price, volume]) => ({ price: Math.round(price * 100) / 100, volume, percent: Math.round((volume / totalVolume) * 10000) / 100 }))
        .sort((a, b) => a.price - b.price);
    }

    it('应正确估算筹码分布', () => {
      const prices = [10, 10.5, 10, 11, 10.5, 11.5];
      const volumes = [1000, 2000, 1500, 3000, 500, 2000];
      const dist = estimateChipDistribution(prices, volumes);
      expect(dist.length).toBeGreaterThan(0);
      const totalPercent = dist.reduce((s, d) => s + d.percent, 0);
      expect(totalPercent).toBeCloseTo(100, 0);
    });
  });
});
