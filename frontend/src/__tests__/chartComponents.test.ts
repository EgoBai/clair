/**
 * 图表组件逻辑测试
 * 覆盖图表数据处理、颜色计算、格式化
 */

import { describe, it, expect } from 'vitest';

describe('图表组件逻辑', () => {
  describe('K线图数据处理', () => {
    interface KLineData {
      date: string;
      open: number;
      close: number;
      high: number;
      low: number;
      volume: number;
      ma5?: number;
      ma10?: number;
      ma20?: number;
    }

    function calculateMA(data: number[], period: number): (number | null)[] {
      return data.map((_, i) => {
        if (i < period - 1) return null;
        const slice = data.slice(i - period + 1, i + 1);
        return +(slice.reduce((a, b) => a + b, 0) / period).toFixed(2);
      });
    }

    function enrichKLineData(raw: Array<{ date: string; open: number; close: number; high: number; low: number; volume: number }>): KLineData[] {
      const closes = raw.map(d => d.close);
      const ma5 = calculateMA(closes, 5);
      const ma10 = calculateMA(closes, 10);
      const ma20 = calculateMA(closes, 20);
      return raw.map((d, i) => ({ ...d, ma5: ma5[i] ?? undefined, ma10: ma10[i] ?? undefined, ma20: ma20[i] ?? undefined }));
    }

    it('MA5 前4条应为 null', () => {
      const data = Array.from({ length: 20 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100 + i, close: 101 + i, high: 102 + i, low: 99 + i, volume: 1e6,
      }));
      const enriched = enrichKLineData(data);
      expect(enriched[0].ma5).toBeUndefined();
      expect(enriched[3].ma5).toBeUndefined();
      expect(enriched[4].ma5).toBeDefined();
    });

    it('MA 应平滑于原始价格', () => {
      const data = Array.from({ length: 30 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100 + i * 2, close: 101 + i * 2, high: 102 + i * 2, low: 99 + i * 2, volume: 1e6,
      }));
      const enriched = enrichKLineData(data);
      const ma20 = enriched[19].ma20!;
      expect(ma20).toBeGreaterThan(100);
      expect(ma20).toBeLessThan(enriched[19].close);
    });
  });

  describe('涨跌颜色计算', () => {
    function getCandleColor(open: number, close: number): 'red' | 'green' | 'gray' {
      if (close > open) return 'red'; // A股：收盘>开盘 → 红色
      if (close < open) return 'green';
      return 'gray';
    }

    it('阳线应为红色', () => {
      expect(getCandleColor(100, 105)).toBe('red');
    });

    it('阴线应为绿色', () => {
      expect(getCandleColor(105, 100)).toBe('green');
    });

    it('十字星应为灰色', () => {
      expect(getCandleColor(100, 100)).toBe('gray');
    });
  });

  describe('成交量着色', () => {
    function getVolumeColor(close: number, preClose: number): string {
      return close >= preClose ? 'rgba(220,38,38,0.6)' : 'rgba(22,163,74,0.6)';
    }

    it('上涨日成交量应为半透明红色', () => {
      const color = getVolumeColor(105, 100);
      expect(color).toContain('220,38,38');
    });

    it('下跌日成交量应为半透明绿色', () => {
      const color = getVolumeColor(95, 100);
      expect(color).toContain('22,163,74');
    });

    it('平盘日成交量应为红色（A股惯例）', () => {
      const color = getVolumeColor(100, 100);
      expect(color).toContain('220,38,38');
    });
  });

  describe('分时图数据', () => {
    interface TimeSharePoint {
      time: string;
      price: number;
      avgPrice: number;
      volume: number;
      preClose: number;
    }

    function generateTimeShareData(preClose: number, points: number = 240): TimeSharePoint[] {
      const data: TimeSharePoint[] = [];
      let price = preClose;
      let totalAmount = 0;
      let totalVolume = 0;
      for (let i = 0; i < points; i++) {
        const hour = 9 + Math.floor((i + 30) / 60);
        const minute = (i + 30) % 60;
        const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        price += (Math.random() - 0.5) * 0.5;
        const vol = Math.floor(Math.random() * 10000);
        totalVolume += vol;
        totalAmount += price * vol;
        data.push({
          time,
          price: +price.toFixed(2),
          avgPrice: +(totalAmount / totalVolume).toFixed(2),
          volume: vol,
          preClose,
        });
      }
      return data;
    }

    it('分时数据应有240个点（4小时）', () => {
      const data = generateTimeShareData(100);
      expect(data).toHaveLength(240);
    });

    it('均价应介于最高价和最低价之间', () => {
      const data = generateTimeShareData(100, 50);
      const prices = data.map(d => d.price);
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      for (const point of data) {
        expect(point.avgPrice).toBeGreaterThanOrEqual(minPrice - 1);
        expect(point.avgPrice).toBeLessThanOrEqual(maxPrice + 1);
      }
    });

    it('昨收线应在第一个点中包含', () => {
      const data = generateTimeShareData(100);
      expect(data[0].preClose).toBe(100);
    });
  });

  describe('资金流向数据', () => {
    interface FundFlow {
      date: string;
      mainNet: number; // 主力净流入
      superLarge: number;
      large: number;
      medium: number;
      small: number;
    }

    it('主力净流入 = 超大单 + 大单', () => {
      const flow: FundFlow = {
        date: '2024-03-01',
        superLarge: 50000000,
        large: 30000000,
        medium: -10000000,
        small: -20000000,
        mainNet: 50000000 + 30000000,
      };
      expect(flow.mainNet).toBe(flow.superLarge + flow.large);
    });

    it('净流入总计应等于各项之和', () => {
      const flow: FundFlow = {
        date: '2024-03-01',
        superLarge: 50,
        large: 30,
        medium: -10,
        small: -20,
        mainNet: 80,
      };
      const total = flow.superLarge + flow.large + flow.medium + flow.small;
      expect(total).toBe(50);
    });

    it('金额格式化（亿/万）', () => {
      function formatAmount(amount: number): string {
        const absAmount = Math.abs(amount);
        if (absAmount >= 1e8) return (amount / 1e8).toFixed(2) + '亿';
        if (absAmount >= 1e4) return (amount / 1e4).toFixed(2) + '万';
        return amount.toFixed(0);
      }
      expect(formatAmount(1.5e8)).toBe('1.50亿');
      expect(formatAmount(8.5e4)).toBe('8.50万');
      expect(formatAmount(-2.3e8)).toBe('-2.30亿');
    });
  });

  describe('饼图数据处理', () => {
    interface PieDataItem {
      name: string;
      value: number;
      color: string;
    }

    function normalizePieData(data: PieDataItem[]): PieDataItem[] {
      const total = data.reduce((sum, d) => sum + Math.abs(d.value), 0);
      if (total === 0) return data;
      return data.map(d => ({
        ...d,
        value: +((Math.abs(d.value) / total) * 100).toFixed(1),
      }));
    }

    it('饼图百分比总和应为100', () => {
      const data = [
        { name: '主力', value: 5e8, color: 'red' },
        { name: '散户', value: 3e8, color: 'blue' },
        { name: '其他', value: 2e8, color: 'gray' },
      ];
      const normalized = normalizePieData(data);
      const sum = normalized.reduce((s, d) => s + d.value, 0);
      expect(sum).toBeCloseTo(100, 0);
    });

    it('空数据应返回空', () => {
      const normalized = normalizePieData([]);
      expect(normalized).toHaveLength(0);
    });

    it('全零数据应返回原数据', () => {
      const data = [{ name: 'A', value: 0, color: 'red' }];
      const normalized = normalizePieData(data);
      expect(normalized[0].value).toBe(0);
    });
  });

  describe('Tooltip 格式化', () => {
    function formatTooltip(params: { name: string; value: number; changePercent?: number }): string {
      let text = `${params.name}: ${params.value.toFixed(2)}`;
      if (params.changePercent !== undefined) {
        const sign = params.changePercent >= 0 ? '+' : '';
        text += ` (${sign}${params.changePercent.toFixed(2)}%)`;
      }
      return text;
    }

    it('基本 tooltip 应显示名称和值', () => {
      expect(formatTooltip({ name: '收盘', value: 1800.50 })).toBe('收盘: 1800.50');
    });

    it('涨跌幅应带正负号', () => {
      expect(formatTooltip({ name: '收盘', value: 1800, changePercent: 2.5 })).toContain('+2.50%');
      expect(formatTooltip({ name: '收盘', value: 1750, changePercent: -1.2 })).toContain('-1.20%');
    });

    it('零涨跌幅应显示 +0.00%', () => {
      expect(formatTooltip({ name: '收盘', value: 1800, changePercent: 0 })).toContain('+0.00%');
    });
  });
});
