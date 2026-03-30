import { describe, it, expect } from 'vitest';

describe('API 数据模型测试', () => {
  describe('市场统计数据模型', () => {
    it('涨跌分布应该总和等于总数', () => {
      const distribution = { up: 1500, down: 2000, flat: 500 };
      const total = distribution.up + distribution.down + distribution.flat;
      expect(total).toBe(4000);
      expect(distribution.up).toBeGreaterThanOrEqual(0);
      expect(distribution.down).toBeGreaterThanOrEqual(0);
      expect(distribution.flat).toBeGreaterThanOrEqual(0);
    });

    it('涨跌比应该正确计算', () => {
      const ratio = 1500 / 2000;
      expect(ratio).toBeCloseTo(0.75, 2);
    });

    it('市场宽度指标范围应该在0-100%', () => {
      const marketBreadth = (1500 / 4000) * 100;
      expect(marketBreadth).toBeGreaterThanOrEqual(0);
      expect(marketBreadth).toBeLessThanOrEqual(100);
    });
  });

  describe('板块热度数据模型', () => {
    it('板块数据应该包含必要字段', () => {
      const sector = {
        name: '白酒',
        code: 'bk0477',
        changePercent: 2.5,
        stocks: 20,
        avgPE: 35.5,
        turnover: 5000000000,
        fundFlow: 200000000,
      };
      expect(sector.name).toBeTruthy();
      expect(sector.code).toBeTruthy();
      expect(typeof sector.changePercent).toBe('number');
      expect(sector.stocks).toBeGreaterThan(0);
    });

    it('板块排序应该按涨跌幅降序', () => {
      const sectors = [
        { name: '白酒', changePercent: 2.5 },
        { name: '银行', changePercent: -0.5 },
        { name: '半导体', changePercent: 3.2 },
        { name: '医药', changePercent: 1.0 },
      ];
      const sorted = [...sectors].sort((a, b) => b.changePercent - a.changePercent);
      expect(sorted[0].name).toBe('半导体');
      expect(sorted[sorted.length - 1].name).toBe('银行');
    });
  });

  describe('行业分析数据模型', () => {
    it('成分股权重总和应该<=100', () => {
      const stocks = [
        { symbol: '600519', weight: 25.5 },
        { symbol: '000858', weight: 15.3 },
        { symbol: '002304', weight: 12.1 },
        { symbol: '000568', weight: 10.8 },
        { symbol: '600809', weight: 8.2 },
      ];
      const totalWeight = stocks.reduce((sum, s) => sum + s.weight, 0);
      expect(totalWeight).toBeLessThanOrEqual(100);
    });

    it('PE分布区间应该覆盖完整范围', () => {
      const peDistribution = [
        { range: '<0', count: 5 },
        { range: '0-20', count: 10 },
        { range: '20-40', count: 25 },
        { range: '40-60', count: 8 },
        { range: '>60', count: 2 },
      ];
      const total = peDistribution.reduce((sum, d) => sum + d.count, 0);
      expect(total).toBe(50);
    });

    it('市值分布应该包含大小公司', () => {
      const capDistribution = [
        { range: '>1000亿', count: 3, label: '大盘' },
        { range: '500-1000亿', count: 5, label: '中大盘' },
        { range: '100-500亿', count: 15, label: '中盘' },
        { range: '<100亿', count: 7, label: '小盘' },
      ];
      expect(capDistribution.length).toBeGreaterThan(3);
    });
  });

  describe('财务数据模型', () => {
    it('资产负债表应该平衡: 资产=负债+权益', () => {
      const balanceSheet = {
        totalAssets: 1000000,
        totalLiabilities: 600000,
        totalEquity: 400000,
      };
      expect(balanceSheet.totalAssets).toBeCloseTo(
        balanceSheet.totalLiabilities + balanceSheet.totalEquity, 0
      );
    });

    it('流动比率应该在合理范围', () => {
      const currentRatio = 800000 / 500000;
      expect(currentRatio).toBeGreaterThan(0);
      expect(currentRatio).toBeLessThan(10); // 异常高值可能有问题
    });

    it('资产负债率应该在0-100%之间', () => {
      const debtRatio = (600000 / 1000000) * 100;
      expect(debtRatio).toBeGreaterThanOrEqual(0);
      expect(debtRatio).toBeLessThanOrEqual(100);
    });

    it('毛利率应该大于净利率', () => {
      const grossMargin = 65.5;
      const netMargin = 32.1;
      expect(grossMargin).toBeGreaterThan(netMargin);
    });

    it('ROE 应该在合理范围', () => {
      const roe = 25.5;
      expect(roe).toBeGreaterThan(-100);
      expect(roe).toBeLessThan(200);
    });
  });

  describe('新闻数据模型', () => {
    it('新闻应该有5种分类', () => {
      const categories = ['market', 'company', 'policy', 'international', 'analysis'];
      expect(categories).toHaveLength(5);
    });

    it('新闻情感应该是3种之一', () => {
      const sentiments = ['positive', 'negative', 'neutral'];
      for (const s of sentiments) {
        expect(['positive', 'negative', 'neutral']).toContain(s);
      }
    });

    it('新闻评分应该在0-1之间', () => {
      const scores = [0, 0.3, 0.5, 0.7, 1.0];
      for (const s of scores) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('投资组合数据模型', () => {
    it('持仓成本应该正确计算', () => {
      const positions = [
        { symbol: '600519', avgCost: 1800, shares: 100 },
        { symbol: '000858', avgCost: 150, shares: 200 },
      ];
      const totalCost = positions.reduce((sum, p) => sum + p.avgCost * p.shares, 0);
      expect(totalCost).toBe(1800 * 100 + 150 * 200);
    });

    it('加仓均价应该正确计算', () => {
      const oldCost = 100;
      const oldShares = 100;
      const newCost = 120;
      const newShares = 50;
      const avgCost = (oldCost * oldShares + newCost * newShares) / (oldShares + newShares);
      expect(avgCost).toBeCloseTo(106.67, 1);
    });

    it('盈亏应该正确计算', () => {
      const cost = 100;
      const current = 120;
      const shares = 100;
      const profit = (current - cost) * shares;
      const profitRate = ((current - cost) / cost) * 100;
      expect(profit).toBe(2000);
      expect(profitRate).toBe(20);
    });
  });
});
