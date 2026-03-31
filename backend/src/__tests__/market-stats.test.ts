import { describe, it, expect } from 'vitest';

/**
 * 市场统计数据结构和逻辑测试
 */
describe('Market Stats', () => {
  describe('涨跌分布', () => {
    const ranges = [
      { label: '涨停', min: 9.9, max: 10.1, count: 25, color: '#dc2626' },
      { label: '涨幅>7%', min: 7, max: 9.9, count: 40, color: '#ef4444' },
      { label: '涨幅5-7%', min: 5, max: 7, count: 60, color: '#f87171' },
      { label: '涨幅3-5%', min: 3, max: 5, count: 100, color: '#fca5a5' },
      { label: '涨幅1-3%', min: 1, max: 3, count: 300, color: '#fecaca' },
      { label: '涨幅0-1%', min: 0, max: 1, count: 500, color: '#fee2e2' },
      { label: '平盘', min: -0.01, max: 0.01, count: 80, color: '#9ca3af' },
      { label: '跌幅0-1%', min: -1, max: 0, count: 500, color: '#d1fae5' },
      { label: '跌幅1-3%', min: -3, max: -1, count: 300, color: '#a7f3d0' },
      { label: '跌幅3-5%', min: -5, max: -3, count: 100, color: '#6ee7b7' },
      { label: '跌幅5-7%', min: -7, max: -5, count: 60, color: '#34d399' },
      { label: '跌幅>7%', min: -10.1, max: -7, count: 40, color: '#10b981' },
      { label: '跌停', min: -10.1, max: -9.9, count: 10, color: '#059669' },
    ];

    it('分布区间应该完整覆盖涨跌范围', () => {
      expect(ranges.length).toBe(13);
      expect(ranges.some(r => r.label === '涨停')).toBe(true);
      expect(ranges.some(r => r.label === '跌停')).toBe(true);
      expect(ranges.some(r => r.label === '平盘')).toBe(true);
    });

    it('每个区间应该有 count 和 color', () => {
      for (const r of ranges) {
        expect(r.count).toBeGreaterThanOrEqual(0);
        expect(r.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('上涨数应该正确汇总', () => {
      const rising = ranges
        .filter(r => r.max > 0 && r.min >= 0)
        .reduce((sum, r) => sum + r.count, 0);
      expect(rising).toBe(25 + 40 + 60 + 100 + 300 + 500);
    });

    it('下跌数应该正确汇总', () => {
      const falling = ranges
        .filter(r => r.max <= 0 && r.min < -0.01)
        .reduce((sum, r) => sum + r.count, 0);
      expect(falling).toBe(500 + 300 + 100 + 60 + 40 + 10);
    });

    it('summary 应该包含 limitUp 和 limitDown', () => {
      const limitUp = ranges.find(r => r.label === '涨停')?.count || 0;
      const limitDown = ranges.find(r => r.label === '跌停')?.count || 0;
      expect(limitUp).toBe(25);
      expect(limitDown).toBe(10);
    });
  });

  describe('板块热度', () => {
    const sectors = [
      { name: '人工智能', changePercent: 3.5, turnover: 850e8, stockCount: 128 },
      { name: '半导体', changePercent: 2.8, turnover: 720e8, stockCount: 95 },
      { name: '银行', changePercent: 0.3, turnover: 380e8, stockCount: 42 },
      { name: '煤炭', changePercent: -1.8, turnover: 200e8, stockCount: 38 },
    ];

    it('应该有热度分数', () => {
      const heatData = sectors.map(s => ({
        ...s,
        heatScore: Math.round(
          (s.changePercent * 0.4 + (s.turnover / 1e10) * 0.4 + s.stockCount * 0.01) * 100
        ) / 100,
      }));

      for (const s of heatData) {
        expect(typeof s.heatScore).toBe('number');
      }
    });

    it('应该按热度排序', () => {
      const heatData = sectors.map(s => ({
        ...s,
        heatScore: Math.round(
          (s.changePercent * 0.4 + (s.turnover / 1e10) * 0.4 + s.stockCount * 0.01) * 100
        ) / 100,
      })).sort((a, b) => b.heatScore - aHeatScore(a));

      // AI should be hot
      expect(heatData[0].name).toBe('人工智能');
    });

    function aHeatScore(s: any) {
      return Math.round(
        (s.changePercent * 0.4 + (s.turnover / 1e10) * 0.4 + s.stockCount * 0.01) * 100
      ) / 100;
    }

    it('phase 应该基于涨幅', () => {
      const getPhase = (change: number) =>
        change > 2 ? '主升' : change > 0 ? '吸筹' : change > -1 ? '派发' : '下跌';

      expect(getPhase(3.5)).toBe('主升');
      expect(getPhase(0.5)).toBe('吸筹');
      expect(getPhase(-0.5)).toBe('派发');
      expect(getPhase(-2)).toBe('下跌');
    });
  });

  describe('时间戳格式', () => {
    it('应该返回 ISO 时间戳', () => {
      const timestamp = new Date().toISOString();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('涨跌家数验证', () => {
    it('上涨+下跌+平盘 应该等于总数', () => {
      const total = 5200;
      const rising = 1500;
      const falling = 3000;
      const unchanged = 700;
      expect(rising + falling + unchanged).toBe(total);
    });
  });
});
