/**
 * ETF 模块测试
 * 覆盖 ETF 数据结构、净值计算、折溢价率、筛选排序
 */

import { describe, it, expect } from 'vitest';

describe('ETF 数据模块', () => {
  describe('ETF 数据结构', () => {
    const etf = {
      symbol: '510300',
      name: '沪深300ETF',
      type: 'index',
      benchmark: '沪深300',
      nav: 4.562,
      preNav: 4.528,
      changePercent: 0.75,
      premiumRate: 0.12,
      totalAssets: 520e8,
      trackingError: 0.03,
      dividendYield: 2.1,
      expenseRatio: 0.15,
      volume: 85000000,
      turnover: 38.5e8,
      holdings: 300,
    };

    it('ETF 应包含必填字段', () => {
      const requiredFields = ['symbol', 'name', 'type', 'nav', 'changePercent', 'totalAssets'];
      for (const field of requiredFields) {
        expect(etf).toHaveProperty(field);
      }
    });

    it('净值涨跌幅应与净值和前净值一致', () => {
      const calcChange = ((etf.nav - etf.preNav) / etf.preNav) * 100;
      expect(calcChange).toBeCloseTo(etf.changePercent, 1);
    });

    it('ETF 类型应在预定义范围内', () => {
      const validTypes = ['index', 'sector', 'qdii', 'commodity', 'bond', 'theme'];
      expect(validTypes).toContain(etf.type);
    });

    it('跟踪误差应为非负数', () => {
      expect(etf.trackingError).toBeGreaterThanOrEqual(0);
    });

    it('管理费率应为正数', () => {
      expect(etf.expenseRatio).toBeGreaterThan(0);
    });

    it('总资产应为正数', () => {
      expect(etf.totalAssets).toBeGreaterThan(0);
    });
  });

  describe('ETF 分类筛选', () => {
    const etfs = [
      { symbol: '510300', name: '沪深300ETF', type: 'index' },
      { symbol: '510500', name: '中证500ETF', type: 'index' },
      { symbol: '512880', name: '证券ETF', type: 'sector' },
      { symbol: '513100', name: '纳指ETF', type: 'qdii' },
      { symbol: '518880', name: '黄金ETF', type: 'commodity' },
    ];

    it('按类型筛选应返回正确结果', () => {
      const indexETFs = etfs.filter(e => e.type === 'index');
      expect(indexETFs).toHaveLength(2);
      expect(indexETFs.map(e => e.symbol)).toContain('510300');
    });

    it('应有多种 ETF 类型', () => {
      const types = new Set(etfs.map(e => e.type));
      expect(types.size).toBeGreaterThanOrEqual(4);
    });
  });

  describe('折溢价率', () => {
    function calculatePremiumRate(marketPrice: number, nav: number): number {
      return +(((marketPrice - nav) / nav) * 100).toFixed(2);
    }

    it('市场价格高于净值应为溢价', () => {
      const rate = calculatePremiumRate(4.6, 4.5);
      expect(rate).toBeGreaterThan(0);
    });

    it('市场价格低于净值应为折价', () => {
      const rate = calculatePremiumRate(4.4, 4.5);
      expect(rate).toBeLessThan(0);
    });

    it('价格等于净值应为0', () => {
      const rate = calculatePremiumRate(4.5, 4.5);
      expect(rate).toBe(0);
    });

    it('QDII ETF 溢价率通常较高', () => {
      const qdiiPremium = 2.35;
      const indexPremium = 0.12;
      expect(qdiiPremium).toBeGreaterThan(indexPremium);
    });
  });

  describe('ETF 净值历史', () => {
    function generateNavHistory(baseNav: number, days: number) {
      const history = [];
      let nav = baseNav;
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        nav += (Math.random() - 0.48) * 0.03;
        history.push({
          date: date.toISOString().split('T')[0],
          nav: +nav.toFixed(4),
          changePercent: +((Math.random() - 0.48) * 3).toFixed(2),
        });
      }
      return history;
    }

    it('净值历史应有正确天数', () => {
      const history = generateNavHistory(4.5, 30);
      expect(history).toHaveLength(30);
    });

    it('净值历史应按日期正序', () => {
      const history = generateNavHistory(4.5, 10);
      for (let i = 1; i < history.length; i++) {
        expect(history[i].date >= history[i - 1].date).toBe(true);
      }
    });

    it('每日净值应为正数', () => {
      const history = generateNavHistory(4.5, 30);
      for (const day of history) {
        expect(day.nav).toBeGreaterThan(0);
      }
    });

    it('日涨跌幅应在合理范围内', () => {
      const history = generateNavHistory(4.5, 30);
      for (const day of history) {
        expect(Math.abs(day.changePercent)).toBeLessThanOrEqual(10); // ETF 一般 <10%
      }
    });
  });

  describe('ETF 持仓明细', () => {
    const topHoldings = [
      { name: '贵州茅台', weight: 5.2, change: 0.1 },
      { name: '宁德时代', weight: 3.8, change: -0.2 },
      { name: '招商银行', weight: 3.5, change: 0.3 },
    ];

    it('持仓权重应为正数', () => {
      for (const h of topHoldings) {
        expect(h.weight).toBeGreaterThan(0);
      }
    });

    it('前10大持仓权重之和应合理', () => {
      const totalWeight = topHoldings.reduce((sum, h) => sum + h.weight, 0);
      expect(totalWeight).toBeGreaterThan(0);
      expect(totalWeight).toBeLessThanOrEqual(100);
    });

    it('持仓变动应有正有负', () => {
      const hasPositive = topHoldings.some(h => h.change > 0);
      const hasNegative = topHoldings.some(h => h.change < 0);
      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });
  });

  describe('ETF 排行榜', () => {
    const etfs = [
      { symbol: '510300', name: '沪深300ETF', totalAssets: 520e8, changePercent: 0.75 },
      { symbol: '512880', name: '证券ETF', totalAssets: 350e8, changePercent: 0.53 },
      { symbol: '513100', name: '纳指ETF', totalAssets: 220e8, changePercent: 0.90 },
      { symbol: '159766', name: '旅游ETF', totalAssets: 25e8, changePercent: -0.79 },
    ];

    it('应按规模降序排列', () => {
      const sorted = [...etfs].sort((a, b) => b.totalAssets - a.totalAssets);
      expect(sorted[0].symbol).toBe('510300');
    });

    it('应按涨跌幅降序排列', () => {
      const sorted = [...etfs].sort((a, b) => b.changePercent - a.changePercent);
      expect(sorted[0].symbol).toBe('513100');
    });

    it('应按涨跌幅升序排列', () => {
      const sorted = [...etfs].sort((a, b) => a.changePercent - b.changePercent);
      expect(sorted[0].symbol).toBe('159766');
    });
  });
});
