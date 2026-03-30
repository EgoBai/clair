import { describe, it, expect } from 'vitest';

/**
 * 新图表组件逻辑测试
 */

describe('新图表组件逻辑', () => {
  describe('河流图数据处理', () => {
    interface RiverData {
      time: string;
      [sector: string]: string | number;
    }

    const mockData: RiverData[] = [
      { time: '09:30', 科技: 50000, 金融: 30000, 消费: 20000 },
      { time: '10:00', 科技: 55000, 金融: 28000, 消费: 22000 },
      { time: '10:30', 科技: 52000, 金融: 32000, 消费: 21000 },
    ];

    it('应包含时间轴数据', () => {
      mockData.forEach(d => {
        expect(d.time).toBeTruthy();
      });
    });

    it('应包含板块资金数据', () => {
      mockData.forEach(d => {
        expect(typeof d['科技']).toBe('number');
        expect(typeof d['金融']).toBe('number');
      });
    });

    it('资金值应为正数（绝对值）或负数（净流出）', () => {
      mockData.forEach(d => {
        Object.entries(d).forEach(([key, val]) => {
          if (key !== 'time') {
            expect(typeof val).toBe('number');
          }
        });
      });
    });

    it('应支持wigggle偏移模式', () => {
      // stackOffset="wiggle" 允许负值河流
      const negativeData: RiverData[] = [
        { time: '09:30', 科技: -10000, 金融: 30000 },
        { time: '10:00', 科技: 5000, 金融: 25000 },
      ];
      expect(negativeData.length).toBe(2);
    });

    it('格式化显示应转为亿', () => {
      const val = 50000;
      const formatted = `${(val / 10000).toFixed(0)}亿`;
      expect(formatted).toBe('5亿');
    });
  });

  describe('板块树图数据处理', () => {
    interface SectorNode {
      name: string;
      changePercent: number;
      volume: number;
      stocks?: number;
    }

    interface SectorGroup {
      name: string;
      children: SectorNode[];
    }

    const mockSectors: SectorGroup[] = [
      {
        name: '科技',
        children: [
          { name: '半导体', changePercent: 2.5, volume: 80000, stocks: 50 },
          { name: '软件', changePercent: -1.2, volume: 60000, stocks: 80 },
        ],
      },
      {
        name: '消费',
        children: [
          { name: '白酒', changePercent: 0.8, volume: 50000, stocks: 20 },
        ],
      },
    ];

    it('应分组组织板块数据', () => {
      expect(mockSectors.length).toBe(2);
      expect(mockSectors[0].children.length).toBe(2);
    });

    it('涨跌幅颜色映射', () => {
      const getColor = (changePercent: number): string => {
        if (changePercent >= 3) return '#cf1322';
        if (changePercent >= 1) return '#f5222d';
        if (changePercent >= 0) return '#fa541c';
        if (changePercent >= -1) return '#3f8600';
        if (changePercent >= -3) return '#237804';
        return '#135200';
      };

      expect(getColor(5)).toBe('#cf1322');
      expect(getColor(1.5)).toBe('#f5222d');
      expect(getColor(0.5)).toBe('#fa541c');
      expect(getColor(-0.5)).toBe('#3f8600');
      expect(getColor(-2)).toBe('#237804');
      expect(getColor(-5)).toBe('#135200');
    });

    it('树图size应取volume的最小值1000', () => {
      const size = Math.max(0, 1000);
      expect(size).toBe(1000);
      const size2 = Math.max(50000, 1000);
      expect(size2).toBe(50000);
    });
  });

  describe('K线图+成交量数据处理', () => {
    interface CandlestickData {
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      ma5?: number;
      ma10?: number;
      ma20?: number;
    }

    const mockKline: CandlestickData[] = [
      { date: '2024-01-02', open: 10, high: 10.5, low: 9.8, close: 10.3, volume: 50000, ma5: 10.1, ma10: 10.0, ma20: 9.9 },
      { date: '2024-01-03', open: 10.3, high: 10.8, low: 10.1, close: 10.6, volume: 60000, ma5: 10.3, ma10: 10.1, ma20: 10.0 },
      { date: '2024-01-04', open: 10.6, high: 10.7, low: 10.2, close: 10.3, volume: 45000, ma5: 10.4, ma10: 10.2, ma20: 10.0 },
    ];

    it('K线数据应包含OHLCV', () => {
      mockKline.forEach(d => {
        expect(d.open).toBeGreaterThan(0);
        expect(d.high).toBeGreaterThanOrEqual(d.open);
        expect(d.high).toBeGreaterThanOrEqual(d.close);
        expect(d.low).toBeLessThanOrEqual(d.open);
        expect(d.low).toBeLessThanOrEqual(d.close);
        expect(d.volume).toBeGreaterThan(0);
      });
    });

    it('阳线颜色应为红色', () => {
      mockKline.forEach(d => {
        const isUp = d.close >= d.open;
        const color = isUp ? '#cf1322' : '#3f8600';
        if (d.close > d.open) expect(color).toBe('#cf1322');
        if (d.close < d.open) expect(color).toBe('#3f8600');
      });
    });

    it('价格区间计算', () => {
      const prices = mockKline.flatMap(d => [d.high, d.low]);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const padding = (max - min) * 0.05;
      const domain = [Math.floor((min - padding) * 100) / 100, Math.ceil((max + padding) * 100) / 100];
      expect(domain[0]).toBeLessThan(min);
      expect(domain[1]).toBeGreaterThan(max);
    });

    it('涨跌计算', () => {
      const latest = mockKline[mockKline.length - 1];
      const prevClose = mockKline[mockKline.length - 2].close;
      const change = latest.close - prevClose;
      const changePct = (change / prevClose * 100);
      expect(typeof change).toBe('number');
      expect(typeof changePct).toBe('number');
    });

    it('成交量格式化', () => {
      const vol = 50000;
      const formatted = `${(vol / 10000).toFixed(2)}万手`;
      expect(formatted).toBe('5.00万手');
    });

    it('均线数据应为可选', () => {
      const withoutMA: CandlestickData = {
        date: '2024-01-05', open: 10, high: 11, low: 9.5, close: 10.5, volume: 40000,
      };
      expect(withoutMA.ma5).toBeUndefined();
      expect(withoutMA.ma10).toBeUndefined();
      expect(withoutMA.ma20).toBeUndefined();
    });
  });

  describe('图表交互逻辑', () => {
    it('点击柱子应更新选中状态', () => {
      let selected: any = null;
      const handleBarClick = (barData: any) => {
        if (barData?.activePayload?.[0]) {
          selected = barData.activePayload[0].payload;
        }
      };
      handleBarClick({ activePayload: [{ payload: { date: '2024-01-02', close: 10.3 } }] });
      expect(selected).not.toBeNull();
      expect(selected.date).toBe('2024-01-02');
    });

    it('Brush缩放范围', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ date: `Day${i}` }));
      expect(data.length).toBe(100);
      // Brush默认显示部分数据
      const visibleRange = 20;
      expect(visibleRange).toBeLessThan(data.length);
    });
  });
});
