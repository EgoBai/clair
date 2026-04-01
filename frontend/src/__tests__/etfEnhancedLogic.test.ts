/**
 * ETF页面增强逻辑测试
 * 覆盖ETF套利、跟踪误差、规模分析
 */

import { describe, it, expect } from 'vitest';

describe('ETF页面增强逻辑', () => {
  describe('ETF溢价率计算', () => {
    function calcPremium(nav: number, marketPrice: number): number {
      if (nav <= 0) return 0;
      return Math.round(((marketPrice - nav) / nav) * 10000) / 100;
    }

    it('溢价应为正', () => {
      expect(calcPremium(1.0, 1.02)).toBe(2);
    });

    it('折价应为负', () => {
      expect(calcPremium(1.0, 0.98)).toBe(-2);
    });

    it('净值为0应返回0', () => {
      expect(calcPremium(0, 1)).toBe(0);
    });
  });

  describe('ETF跟踪误差', () => {
    function calcTrackingError(etfReturns: number[], indexReturns: number[]): number {
      const len = Math.min(etfReturns.length, indexReturns.length);
      if (len === 0) return 0;
      const diffs = [];
      for (let i = 0; i < len; i++) {
        diffs.push(etfReturns[i] - indexReturns[i]);
      }
      const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
      const variance = diffs.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / diffs.length;
      return Math.round(Math.sqrt(variance) * 10000) / 100;
    }

    it('应正确计算跟踪误差', () => {
      const etf = [0.01, 0.02, 0.015, 0.03];
      const index = [0.011, 0.018, 0.016, 0.028];
      const te = calcTrackingError(etf, index);
      expect(te).toBeGreaterThan(0);
    });

    it('完全跟踪误差应为0', () => {
      const returns = [0.01, 0.02, 0.015];
      expect(calcTrackingError(returns, returns)).toBe(0);
    });
  });

  describe('ETF规模分析', () => {
    function analyzeSize(totalShares: number, nav: number): {
      totalAsset: number;
      level: 'large' | 'medium' | 'small' | 'tiny';
    } {
      const totalAsset = totalShares * nav;
      let level: 'large' | 'medium' | 'small' | 'tiny' = 'tiny';
      if (totalAsset >= 100e8) level = 'large';
      else if (totalAsset >= 10e8) level = 'medium';
      else if (totalAsset >= 1e8) level = 'small';
      return { totalAsset, level };
    }

    it('100亿以上应为大型', () => {
      const result = analyzeSize(1e10, 1.5); // 1.5e10 = 150亿
      expect(result.level).toBe('large');
    });

    it('1亿以下应为微型', () => {
      const result = analyzeSize(5e6, 1);
      expect(result.level).toBe('tiny');
    });
  });

  describe('ETF费率比较', () => {
    interface ETFFee {
      managementFee: number; // 年化管理费
      custodyFee: number;    // 年化托管费
      totalFee: number;      // 总费率
    }

    function compareFees(fees: Record<string, ETFFee>): { cheapest: string; mostExpensive: string } {
      const entries = Object.entries(fees);
      entries.sort((a, b) => a[1].totalFee - b[1].totalFee);
      return { cheapest: entries[0][0], mostExpensive: entries[entries.length - 1][0] };
    }

    it('应找到最低和最高费率', () => {
      const fees = {
        'ETF-A': { managementFee: 0.15, custodyFee: 0.05, totalFee: 0.2 },
        'ETF-B': { managementFee: 0.5, custodyFee: 0.1, totalFee: 0.6 },
        'ETF-C': { managementFee: 0.3, custodyFee: 0.05, totalFee: 0.35 },
      };
      const result = compareFees(fees);
      expect(result.cheapest).toBe('ETF-A');
      expect(result.mostExpensive).toBe('ETF-B');
    });
  });

  describe('ETF申赎清单', () => {
    interface PCFItem {
      symbol: string;
      name: string;
      quantity: number;
      cash替代: number;
    }

    function validatePCF(items: PCFItem[]): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      if (items.length === 0) errors.push('申购赎回清单不能为空');
      for (const item of items) {
        if (item.quantity <= 0 && item.cash替代 <= 0) {
          errors.push(`${item.symbol} 数量和现金替代都不能为0`);
        }
      }
      return { valid: errors.length === 0, errors };
    }

    it('有效清单应通过', () => {
      const items: PCFItem[] = [
        { symbol: '600519', name: '茅台', quantity: 100, cash替代: 0 },
        { symbol: '000858', name: '五粮液', quantity: 200, cash替代: 0 },
      ];
      expect(validatePCF(items).valid).toBe(true);
    });

    it('空清单应报错', () => {
      expect(validatePCF([]).valid).toBe(false);
    });
  });
});
