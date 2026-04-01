/**
 * 首页逻辑测试
 * 覆盖市场状态判断、金额格式化、涨跌比计算
 */

import { describe, it, expect } from 'vitest';

describe('首页逻辑', () => {
  describe('交易时间判断', () => {
    function isMarketOpen(date: Date = new Date()): boolean {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const day = date.getDay();
      if (day === 0 || day === 6) return false;
      const totalMinutes = hours * 60 + minutes;
      const morningStart = 9 * 60 + 15;
      const morningEnd = 11 * 60 + 30;
      const afternoonStart = 13 * 60;
      const afternoonEnd = 15 * 60;
      return (totalMinutes >= morningStart && totalMinutes <= morningEnd) ||
        (totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd);
    }

    it('工作日9:15-11:30应为开盘', () => {
      // 周一上午10点
      const d = new Date(2024, 0, 8, 10, 0);
      expect(isMarketOpen(d)).toBe(true);
    });

    it('工作日13:00-15:00应为开盘', () => {
      const d = new Date(2024, 0, 8, 14, 0);
      expect(isMarketOpen(d)).toBe(true);
    });

    it('工作日11:31-12:59应为休市', () => {
      const d = new Date(2024, 0, 8, 12, 0);
      expect(isMarketOpen(d)).toBe(false);
    });

    it('工作日9:00应为休市', () => {
      const d = new Date(2024, 0, 8, 9, 0);
      expect(isMarketOpen(d)).toBe(false);
    });

    it('工作日15:01应为休市', () => {
      const d = new Date(2024, 0, 8, 15, 1);
      expect(isMarketOpen(d)).toBe(false);
    });

    it('周六应为休市', () => {
      const d = new Date(2024, 0, 6, 10, 0); // 周六
      expect(isMarketOpen(d)).toBe(false);
    });

    it('周日应为休市', () => {
      const d = new Date(2024, 0, 7, 10, 0); // 周日
      expect(isMarketOpen(d)).toBe(false);
    });
  });

  describe('市值格式化', () => {
    function formatMarketCap(cap: number): string {
      if (cap >= 1e8) return (cap / 1e8).toFixed(1) + '亿';
      if (cap >= 1e4) return (cap / 1e4).toFixed(0) + '万';
      return cap.toFixed(0);
    }

    it('亿级市值应正确格式化', () => {
      expect(formatMarketCap(1.5e8)).toBe('1.5亿');
      expect(formatMarketCap(100e8)).toBe('100.0亿');
    });

    it('万级市值应正确格式化', () => {
      expect(formatMarketCap(50000)).toBe('5万');
      expect(formatMarketCap(99999)).toBe('10万');
    });

    it('小金额直接显示', () => {
      expect(formatMarketCap(500)).toBe('500');
    });
  });

  describe('涨跌比计算', () => {
    function calcRiseFallRatio(summary: { up: number; down: number; flat: number }) {
      return {
        up: summary.up,
        down: summary.down,
        flat: summary.flat,
        ratio: summary.down > 0 ? (summary.up / summary.down).toFixed(2) : '∞',
      };
    }

    it('应正确计算涨跌比', () => {
      const result = calcRiseFallRatio({ up: 200, down: 100, flat: 50 });
      expect(result.ratio).toBe('2.00');
      expect(result.up).toBe(200);
      expect(result.down).toBe(100);
    });

    it('下跌为0时比值为无穷大', () => {
      const result = calcRiseFallRatio({ up: 300, down: 0, flat: 100 });
      expect(result.ratio).toBe('∞');
    });

    it('上涨为0时比值为0', () => {
      const result = calcRiseFallRatio({ up: 0, down: 300, flat: 100 });
      expect(result.ratio).toBe('0.00');
    });
  });

  describe('饼图数据配置', () => {
    function buildPieData(summary: { up: number; down: number; flat: number }) {
      return [
        { name: '上涨', value: summary.up, color: '#ef4444' },
        { name: '下跌', value: summary.down, color: '#22c55e' },
        { name: '平盘', value: summary.flat, color: '#9ca3af' },
      ].filter(d => d.value > 0);
    }

    it('应正确生成饼图数据', () => {
      const data = buildPieData({ up: 200, down: 100, flat: 50 });
      expect(data).toHaveLength(3);
      expect(data[0].name).toBe('上涨');
    });

    it('应过滤值为0的项', () => {
      const data = buildPieData({ up: 300, down: 0, flat: 0 });
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('上涨');
    });
  });

  describe('涨幅榜排序', () => {
    function sortByChangePercent(stocks: { symbol: string; changePercent: number }[], asc = false) {
      return [...stocks].sort((a, b) => asc ? a.changePercent - b.changePercent : b.changePercent - a.changePercent);
    }

    it('涨幅榜应按涨幅降序', () => {
      const stocks = [
        { symbol: '001', changePercent: 2.5 },
        { symbol: '002', changePercent: 5.0 },
        { symbol: '003', changePercent: 1.0 },
      ];
      const sorted = sortByChangePercent(stocks);
      expect(sorted[0].symbol).toBe('002');
      expect(sorted[2].symbol).toBe('003');
    });

    it('跌幅榜应按涨幅升序', () => {
      const stocks = [
        { symbol: '001', changePercent: -2.5 },
        { symbol: '002', changePercent: -5.0 },
        { symbol: '003', changePercent: -1.0 },
      ];
      const sorted = sortByChangePercent(stocks, true);
      expect(sorted[0].symbol).toBe('002');
      expect(sorted[2].symbol).toBe('003');
    });
  });

  describe('自动刷新间隔', () => {
    function getRefreshInterval(isOpen: boolean): number {
      return isOpen ? 30000 : 60000;
    }

    it('开盘时30秒刷新', () => {
      expect(getRefreshInterval(true)).toBe(30000);
    });

    it('休市时60秒刷新', () => {
      expect(getRefreshInterval(false)).toBe(60000);
    });
  });
});
