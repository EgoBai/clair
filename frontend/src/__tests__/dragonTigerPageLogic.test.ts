/**
 * 龙虎榜页面逻辑测试
 * 覆盖龙虎榜数据处理、机构识别、资金流向
 */

import { describe, it, expect } from 'vitest';

describe('龙虎榜页面逻辑', () => {
  describe('机构类型识别', () => {
    type OrgType = 'institution' | 'hot_money' | 'northbound' | 'retail' | 'unknown';

    function identifyOrgType(name: string): OrgType {
      if (/基金|保险|社保|QFII|券商|信托/.test(name)) return 'institution';
      if (/游资|营业部/.test(name) && !/机构/.test(name)) return 'hot_money';
      if (/沪股通|深股通|北向/.test(name)) return 'northbound';
      if (/散户|个人/.test(name)) return 'retail';
      return 'unknown';
    }

    it('基金应识别为机构', () => {
      expect(identifyOrgType('华夏基金管理有限公司')).toBe('institution');
    });

    it('营业部应识别为游资', () => {
      expect(identifyOrgType('华泰证券深圳益田路营业部')).toBe('hot_money');
    });

    it('沪股通应识别为北向', () => {
      expect(identifyOrgType('沪股通专用')).toBe('northbound');
    });

    it('未知机构返回unknown', () => {
      expect(identifyOrgType('某某投资')).toBe('unknown');
    });
  });

  describe('龙虎榜净买入额计算', () => {
    interface DragonTigerEntry {
      buyAmount: number;
      sellAmount: number;
    }

    function calcNetBuy(entries: DragonTigerEntry[]): { totalBuy: number; totalSell: number; netBuy: number } {
      const totalBuy = entries.reduce((s, e) => s + e.buyAmount, 0);
      const totalSell = entries.reduce((s, e) => s + e.sellAmount, 0);
      return { totalBuy, totalSell, netBuy: totalBuy - totalSell };
    }

    it('应正确计算净买入', () => {
      const entries: DragonTigerEntry[] = [
        { buyAmount: 5000, sellAmount: 2000 },
        { buyAmount: 3000, sellAmount: 1000 },
      ];
      const result = calcNetBuy(entries);
      expect(result.totalBuy).toBe(8000);
      expect(result.totalSell).toBe(3000);
      expect(result.netBuy).toBe(5000);
    });

    it('净卖出应为负数', () => {
      const entries: DragonTigerEntry[] = [
        { buyAmount: 1000, sellAmount: 5000 },
      ];
      expect(calcNetBuy(entries).netBuy).toBe(-4000);
    });
  });

  describe('上榜原因分类', () => {
    type Reason = 'price_limit' | 'abnormal_fluctuation' | 'large_volume' | 'block_trade';

    function classifyReason(data: { isLimitUp: boolean; isLimitDown: boolean; amplitude: number; turnoverRate: number }): Reason {
      if (data.isLimitUp || data.isLimitDown) return 'price_limit';
      if (data.amplitude >= 15) return 'abnormal_fluctuation';
      if (data.turnoverRate >= 20) return 'large_volume';
      return 'abnormal_fluctuation';
    }

    it('涨停应分类为涨跌停', () => {
      expect(classifyReason({ isLimitUp: true, isLimitDown: false, amplitude: 10, turnoverRate: 5 })).toBe('price_limit');
    });

    it('高振幅应分类为异常波动', () => {
      expect(classifyReason({ isLimitUp: false, isLimitDown: false, amplitude: 18, turnoverRate: 5 })).toBe('abnormal_fluctuation');
    });

    it('高换手应分类为高换手', () => {
      expect(classifyReason({ isLimitUp: false, isLimitDown: false, amplitude: 8, turnoverRate: 25 })).toBe('large_volume');
    });
  });

  describe('龙虎榜汇总统计', () => {
    interface DragonTigerRecord {
      symbol: string;
      netBuy: number;
      reason: string;
    }

    function summarize(records: DragonTigerRecord[]): {
      totalRecords: number;
      totalNetBuy: number;
      avgNetBuy: number;
      maxNetBuy: { symbol: string; amount: number };
      maxNetSell: { symbol: string; amount: number };
    } {
      const totalNetBuy = records.reduce((s, r) => s + r.netBuy, 0);
      const sorted = [...records].sort((a, b) => b.netBuy - a.netBuy);
      return {
        totalRecords: records.length,
        totalNetBuy,
        avgNetBuy: records.length > 0 ? Math.round(totalNetBuy / records.length) : 0,
        maxNetBuy: sorted.length > 0 ? { symbol: sorted[0].symbol, amount: sorted[0].netBuy } : { symbol: '', amount: 0 },
        maxNetSell: sorted.length > 0 ? { symbol: sorted[sorted.length - 1].symbol, amount: sorted[sorted.length - 1].netBuy } : { symbol: '', amount: 0 },
      };
    }

    it('应正确汇总统计', () => {
      const records: DragonTigerRecord[] = [
        { symbol: '600519', netBuy: 5000, reason: '涨停' },
        { symbol: '000858', netBuy: -3000, reason: '跌停' },
        { symbol: '300750', netBuy: 2000, reason: '异常波动' },
      ];
      const summary = summarize(records);
      expect(summary.totalRecords).toBe(3);
      expect(summary.totalNetBuy).toBe(4000);
      expect(summary.maxNetBuy.symbol).toBe('600519');
      expect(summary.maxNetSell.symbol).toBe('000858');
    });
  });

  describe('营业部排名', () => {
    interface BranchData {
      name: string;
      totalBuy: number;
      totalSell: number;
      tradeCount: number;
    }

    function rankBranches(branches: BranchData[], by: 'totalBuy' | 'netBuy' | 'tradeCount' = 'totalBuy'): BranchData[] {
      return [...branches].sort((a, b) => {
        if (by === 'netBuy') return (b.totalBuy - b.totalSell) - (a.totalBuy - a.totalSell);
        return b[by] - a[by];
      });
    }

    it('应按买入额排名', () => {
      const branches: BranchData[] = [
        { name: 'A', totalBuy: 3000, totalSell: 1000, tradeCount: 5 },
        { name: 'B', totalBuy: 5000, totalSell: 2000, tradeCount: 3 },
      ];
      const ranked = rankBranches(branches);
      expect(ranked[0].name).toBe('B');
    });

    it('应按净买入排名', () => {
      const branches: BranchData[] = [
        { name: 'A', totalBuy: 3000, totalSell: 500, tradeCount: 5 },
        { name: 'B', totalBuy: 5000, totalSell: 3000, tradeCount: 3 },
      ];
      const ranked = rankBranches(branches, 'netBuy');
      expect(ranked[0].name).toBe('A'); // 净买入2500 > 2000
    });
  });
});
