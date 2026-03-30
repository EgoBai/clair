/**
 * ETF 页面逻辑测试
 * 覆盖数据格式化、筛选排序、折溢价计算
 */

import { describe, it, expect } from 'vitest';

describe('ETF 页面逻辑', () => {
  describe('金额格式化', () => {
    function formatAmount(val: number): string {
      if (val >= 1e8) return (val / 1e8).toFixed(1) + '亿';
      if (val >= 1e4) return (val / 1e4).toFixed(0) + '万';
      return val.toFixed(0);
    }

    it('亿级金额应正确格式化', () => {
      expect(formatAmount(5.2e8)).toBe('5.2亿');
      expect(formatAmount(120e8)).toBe('120.0亿');
    });

    it('万级金额应正确格式化', () => {
      expect(formatAmount(8.5e4)).toBe('9万'); // toFixed(0) 四舍五入
      expect(formatAmount(1e5)).toBe('10万');
    });

    it('小额应直接显示数字', () => {
      expect(formatAmount(5000)).toBe('5000');
    });
  });

  describe('ETF 类型标签', () => {
    const typeLabels: Record<string, { label: string; color: string }> = {
      index: { label: '指数型', color: 'blue' },
      sector: { label: '行业型', color: 'orange' },
      qdii: { label: 'QDII', color: 'purple' },
      commodity: { label: '商品型', color: 'gold' },
    };

    it('应有完整的类型标签映射', () => {
      expect(Object.keys(typeLabels).length).toBeGreaterThanOrEqual(4);
    });

    it('每种类型应有标签和颜色', () => {
      for (const [, val] of Object.entries(typeLabels)) {
        expect(val).toHaveProperty('label');
        expect(val).toHaveProperty('color');
        expect(val.label.length).toBeGreaterThan(0);
        expect(val.color.length).toBeGreaterThan(0);
      }
    });
  });

  describe('涨跌幅着色', () => {
    function getChangeColor(val: number): string {
      return val > 0 ? '#dc2626' : val < 0 ? '#16a34a' : '#6b7280';
    }

    it('上涨应为红色', () => {
      expect(getChangeColor(1.5)).toBe('#dc2626');
    });

    it('下跌应为绿色', () => {
      expect(getChangeColor(-0.8)).toBe('#16a34a');
    });

    it('平盘应为灰色', () => {
      expect(getChangeColor(0)).toBe('#6b7280');
    });
  });

  describe('ETF 数据筛选', () => {
    const etfs = [
      { symbol: '510300', name: '沪深300ETF', type: 'index', totalAssets: 520e8 },
      { symbol: '510500', name: '中证500ETF', type: 'index', totalAssets: 380e8 },
      { symbol: '512880', name: '证券ETF', type: 'sector', totalAssets: 350e8 },
      { symbol: '513100', name: '纳指ETF', type: 'qdii', totalAssets: 220e8 },
      { symbol: '518880', name: '黄金ETF', type: 'commodity', totalAssets: 160e8 },
    ];

    it('按类型筛选应正确', () => {
      const indexETFs = etfs.filter(e => e.type === 'index');
      expect(indexETFs).toHaveLength(2);
    });

    it('全部类型应返回所有 ETF', () => {
      expect(etfs).toHaveLength(5);
    });

    it('按规模排序应正确', () => {
      const sorted = [...etfs].sort((a, b) => b.totalAssets - a.totalAssets);
      expect(sorted[0].symbol).toBe('510300');
      expect(sorted[sorted.length - 1].symbol).toBe('518880');
    });
  });

  describe('折溢价显示逻辑', () => {
    function formatPremium(val: number): string {
      return (val > 0 ? '+' : '') + val.toFixed(2) + '%';
    }

    it('溢价应显示正号', () => {
      expect(formatPremium(2.35)).toBe('+2.35%');
    });

    it('折价应显示负号', () => {
      expect(formatPremium(-0.12)).toBe('-0.12%');
    });

    it('零值应显示 0.00%', () => {
      expect(formatPremium(0)).toBe('0.00%');
    });
  });

  describe('统计数据计算', () => {
    const etfs = [
      { changePercent: 1.5, totalAssets: 100e8 },
      { changePercent: -0.8, totalAssets: 200e8 },
      { changePercent: 0.5, totalAssets: 150e8 },
      { changePercent: -1.2, totalAssets: 50e8 },
    ];

    it('总规模应正确累加', () => {
      const total = etfs.reduce((s, e) => s + e.totalAssets, 0);
      expect(total).toBe(500e8);
    });

    it('平均涨跌幅应正确计算', () => {
      const avg = etfs.reduce((s, e) => s + e.changePercent, 0) / etfs.length;
      expect(avg).toBe(0);
    });

    it('涨跌家数应正确统计', () => {
      const rising = etfs.filter(e => e.changePercent > 0).length;
      const falling = etfs.filter(e => e.changePercent < 0).length;
      expect(rising).toBe(2);
      expect(falling).toBe(2);
    });
  });
});
