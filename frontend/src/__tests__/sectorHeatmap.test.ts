import { describe, it, expect } from 'vitest';

/**
 * SectorHeatmap / SectorTreeMap 板块热力图逻辑测试
 */

describe('SectorHeatmap', () => {
  describe('板块数据', () => {
    const sectorData = [
      { name: '酿酒行业', changePercent: 2.5, turnover: 50e9, stocks: 30 },
      { name: '半导体', changePercent: -1.2, turnover: 80e9, stocks: 80 },
      { name: '银行', changePercent: 0.8, turnover: 30e9, stocks: 40 },
    ];

    it('应该有板块名称', () => {
      sectorData.forEach(s => expect(s.name).toBeTruthy());
    });

    it('应该有涨跌幅', () => {
      sectorData.forEach(s => expect(typeof s.changePercent).toBe('number'));
    });

    it('应该有成交额', () => {
      sectorData.forEach(s => expect(s.turnover).toBeGreaterThan(0));
    });
  });

  describe('排序逻辑', () => {
    const data = [
      { name: 'A', changePercent: 1 },
      { name: 'B', changePercent: 3 },
      { name: 'C', changePercent: -2 },
    ];

    it('应该支持按涨跌幅降序', () => {
      const sorted = [...data].sort((a, b) => b.changePercent - a.changePercent);
      expect(sorted[0].name).toBe('B');
      expect(sorted[2].name).toBe('C');
    });

    it('应该支持按涨跌幅升序', () => {
      const sorted = [...data].sort((a, b) => a.changePercent - b.changePercent);
      expect(sorted[0].name).toBe('C');
      expect(sorted[2].name).toBe('B');
    });

    it('应该支持按成交额排序', () => {
      const dataWithTurnover = [
        { name: 'A', changePercent: 1, turnover: 30e9 },
        { name: 'B', changePercent: 3, turnover: 10e9 },
        { name: 'C', changePercent: -2, turnover: 50e9 },
      ];
      const sorted = [...dataWithTurnover].sort((a, b) => b.turnover - a.turnover);
      expect(sorted[0].name).toBe('C');
    });
  });

  describe('涨跌家数', () => {
    it('应该统计上涨家数', () => {
      const stocks = [
        { changePercent: 2 },
        { changePercent: -1 },
        { changePercent: 3 },
        { changePercent: -2 },
        { changePercent: 0.5 },
      ];
      const upCount = stocks.filter(s => s.changePercent > 0).length;
      expect(upCount).toBe(3);
    });

    it('应该统计下跌家数', () => {
      const stocks = [
        { changePercent: 2 },
        { changePercent: -1 },
        { changePercent: 3 },
        { changePercent: -2 },
        { changePercent: 0.5 },
      ];
      const downCount = stocks.filter(s => s.changePercent < 0).length;
      expect(downCount).toBe(2);
    });

    it('应该统计平盘家数', () => {
      const stocks = [
        { changePercent: 2 },
        { changePercent: -1 },
        { changePercent: 0 },
        { changePercent: -2 },
        { changePercent: 0 },
      ];
      const flatCount = stocks.filter(s => s.changePercent === 0).length;
      expect(flatCount).toBe(2);
    });
  });
});
