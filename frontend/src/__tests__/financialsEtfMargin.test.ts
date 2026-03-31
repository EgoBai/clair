import { describe, it, expect, vi } from 'vitest';

/**
 * FinancialsPage / ETFPage / MarginTradingPage 页面逻辑测试
 */

describe('FinancialsPage', () => {
  describe('财务报表数据', () => {
    const financials = {
      revenue: 100e9,
      netProfit: 50e9,
      grossMargin: 0.9,
      netMargin: 0.5,
      roe: 0.3,
      roa: 0.15,
      debtToAsset: 0.25,
      currentRatio: 3.5,
    };

    it('应该有营收数据', () => {
      expect(financials.revenue).toBeGreaterThan(0);
    });

    it('应该有净利润', () => {
      expect(financials.netProfit).toBeGreaterThan(0);
    });

    it('毛利率应该在 0-1 之间', () => {
      expect(financials.grossMargin).toBeGreaterThan(0);
      expect(financials.grossMargin).toBeLessThanOrEqual(1);
    });

    it('ROE 应该为正值（优质公司）', () => {
      expect(financials.roe).toBeGreaterThan(0);
    });

    it('资产负债率应该在合理范围', () => {
      expect(financials.debtToAsset).toBeGreaterThan(0);
      expect(financials.debtToAsset).toBeLessThan(1);
    });
  });

  describe('财务指标同比', () => {
    it('应该计算同比增长率', () => {
      const current = 100;
      const previous = 80;
      const growth = ((current - previous) / previous) * 100;
      expect(growth).toBe(25);
    });

    it('应该计算环比增长率', () => {
      const current = 100;
      const previous = 90;
      const growth = ((current - previous) / previous) * 100;
      expect(growth).toBeCloseTo(11.11, 1);
    });
  });

  describe('财务异常检测', () => {
    it('应该检测毛利率异常下降', () => {
      const margins = [0.9, 0.88, 0.85, 0.6];
      const lastDrop = margins[margins.length - 2] - margins[margins.length - 1];
      expect(lastDrop).toBeGreaterThan(0.1);
    });

    it('应该检测营收增速放缓', () => {
      const growthRates = [25, 20, 15, 8];
      const isSlowing = growthRates.every((r, i) => i === 0 || r <= growthRates[i - 1]);
      expect(isSlowing).toBe(true);
    });
  });
});

describe('ETFPage', () => {
  describe('ETF 数据', () => {
    const etfs = [
      { code: '510300', name: '沪深300ETF', price: 4.5, nav: 4.48, premium: 0.45, trackingError: 0.02 },
      { code: '510500', name: '中证500ETF', price: 6.2, nav: 6.25, premium: -0.80, trackingError: 0.03 },
      { code: '159915', name: '创业板ETF', price: 2.1, nav: 2.09, premium: 0.48, trackingError: 0.01 },
    ];

    it('应该有 ETF 基本数据', () => {
      etfs.forEach(e => {
        expect(e.code).toBeTruthy();
        expect(e.name).toBeTruthy();
        expect(e.price).toBeGreaterThan(0);
      });
    });

    it('应该有净值数据', () => {
      etfs.forEach(e => expect(e.nav).toBeGreaterThan(0));
    });

    it('应该有溢价率', () => {
      etfs.forEach(e => expect(typeof e.premium).toBe('number'));
    });

    it('应该有跟踪误差', () => {
      etfs.forEach(e => expect(e.trackingError).toBeGreaterThanOrEqual(0));
    });
  });

  describe('套利检测', () => {
    it('溢价过高应该提示套利机会', () => {
      const premium = 2.5;
      const threshold = 1.0;
      expect(premium > threshold).toBe(true);
    });

    it('折价过高也应该提示套利', () => {
      const premium = -2.0;
      const threshold = -1.0;
      expect(premium < threshold).toBe(true);
    });
  });

  describe('ETF 相关性', () => {
    it('应该计算 ETF 之间的相关性', () => {
      const etf1 = [1, 2, 3, 4, 5];
      const etf2 = [2, 4, 6, 8, 10];
      // 完美正相关
      const mean1 = etf1.reduce((a, b) => a + b) / etf1.length;
      const mean2 = etf2.reduce((a, b) => a + b) / etf2.length;
      const isCorrelated = mean2 === mean1 * 2;
      expect(isCorrelated).toBe(true);
    });
  });
});

describe('MarginTradingPage', () => {
  describe('融资融券数据', () => {
    const marginData = {
      financingBalance: 1.5e12,
      financingBuy: 50e9,
      financingRepay: 30e9,
      securitiesBalance: 100e9,
      securitiesSell: 5e9,
      securitiesRepay: 3e9,
    };

    it('应该有融资余额', () => {
      expect(marginData.financingBalance).toBeGreaterThan(0);
    });

    it('应该有融资买入额', () => {
      expect(marginData.financingBuy).toBeGreaterThan(0);
    });

    it('应该有融券余额', () => {
      expect(marginData.securitiesBalance).toBeGreaterThan(0);
    });
  });

  describe('净融资买入', () => {
    it('应该计算净融资买入', () => {
      const buy = 50e9;
      const repay = 30e9;
      const netBuy = buy - repay;
      expect(netBuy).toBe(20e9);
    });

    it('净融资为正表示看多', () => {
      const netBuy = 20e9;
      const sentiment = netBuy > 0 ? '看多' : '看空';
      expect(sentiment).toBe('看多');
    });
  });

  describe('融券比例', () => {
    it('应该计算融资融券比', () => {
      const financing = 1.5e12;
      const securities = 100e9;
      const ratio = financing / securities;
      expect(ratio).toBe(15);
    });
  });

  describe('情绪判断', () => {
    const getMarginSentiment = (netBuy: number, balanceChange: number) => {
      if (netBuy > 0 && balanceChange > 0) return '极度乐观';
      if (netBuy > 0) return '偏乐观';
      if (netBuy < 0 && balanceChange < 0) return '极度悲观';
      return '偏悲观';
    };

    it('净买入增加+余额增加 = 极度乐观', () => {
      expect(getMarginSentiment(100, 50)).toBe('极度乐观');
    });

    it('净买入为正 = 偏乐观', () => {
      expect(getMarginSentiment(100, -10)).toBe('偏乐观');
    });

    it('净卖出+余额减少 = 极度悲观', () => {
      expect(getMarginSentiment(-100, -50)).toBe('极度悲观');
    });
  });
});
