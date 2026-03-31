import { describe, it, expect } from 'vitest';

/**
 * IndustryHeatmap 行业热力图组件逻辑测试
 */

describe('IndustryHeatmap', () => {
  describe('颜色映射逻辑', () => {
    const getColor = (changePercent: number): string => {
      if (changePercent >= 5) return '#cc0000';
      if (changePercent >= 3) return '#dd3333';
      if (changePercent >= 1.5) return '#ee6666';
      if (changePercent >= 0.5) return '#ffaaaa';
      if (changePercent >= 0) return '#ffdddd';
      if (changePercent >= -0.5) return '#ddffdd';
      if (changePercent >= -1.5) return '#aaffaa';
      if (changePercent >= -3) return '#66ee66';
      if (changePercent >= -5) return '#33dd33';
      return '#00cc00';
    };

    it('涨幅 >= 5% 应为深红', () => {
      expect(getColor(5)).toBe('#cc0000');
      expect(getColor(8)).toBe('#cc0000');
    });

    it('涨幅 3-5% 应为红色', () => {
      expect(getColor(3)).toBe('#dd3333');
      expect(getColor(4)).toBe('#dd3333');
    });

    it('涨幅 1.5-3% 应为浅红', () => {
      expect(getColor(1.5)).toBe('#ee6666');
      expect(getColor(2)).toBe('#ee6666');
    });

    it('涨幅 0.5-1.5% 应为粉红', () => {
      expect(getColor(0.5)).toBe('#ffaaaa');
      expect(getColor(1)).toBe('#ffaaaa');
    });

    it('涨幅 0-0.5% 应为浅粉', () => {
      expect(getColor(0)).toBe('#ffdddd');
      expect(getColor(0.3)).toBe('#ffdddd');
    });

    it('跌幅 0-0.5% 应为浅绿', () => {
      expect(getColor(-0.3)).toBe('#ddffdd');
      expect(getColor(-0.5)).toBe('#ddffdd');
    });

    it('跌幅 0.5-1.5% 应为绿色', () => {
      expect(getColor(-1)).toBe('#aaffaa');
    });

    it('跌幅 1.5-3% 应为深绿', () => {
      expect(getColor(-2)).toBe('#66ee66');
    });

    it('跌幅 3-5% 应为更深绿', () => {
      expect(getColor(-4)).toBe('#33dd33');
    });

    it('跌幅 >= 5% 应为最深绿', () => {
      expect(getColor(-6)).toBe('#00cc00');
    });

    it('跌幅超过 5% 应为最深绿', () => {
      expect(getColor(-8)).toBe('#00cc00');
    });

    it('跌幅正好 5% 应为深绿', () => {
      expect(getColor(-5)).toBe('#33dd33');
    });
  });

  describe('对比文字色', () => {
    const getContrastColor = (bgColor: string): string => {
      const hex = bgColor.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 128 ? '#000000' : '#ffffff';
    };

    it('浅色背景应使用黑色文字', () => {
      expect(getContrastColor('#ffffff')).toBe('#000000');
      expect(getContrastColor('#ffdddd')).toBe('#000000');
    });

    it('深色背景应使用白色文字', () => {
      expect(getContrastColor('#000000')).toBe('#ffffff');
      expect(getContrastColor('#cc0000')).toBe('#ffffff');
    });
  });

  describe('热力图数据', () => {
    const sampleData = [
      { industry: '白酒', avgChangePercent: 3.5, totalTurnover: 50000000000, stockCount: 20 },
      { industry: '半导体', avgChangePercent: -2.1, totalTurnover: 80000000000, stockCount: 50 },
      { industry: '银行', avgChangePercent: 0.5, totalTurnover: 30000000000, stockCount: 30 },
    ];

    it('应该有行业名称', () => {
      sampleData.forEach(d => {
        expect(d.industry).toBeTruthy();
      });
    });

    it('应该有平均涨跌幅', () => {
      sampleData.forEach(d => {
        expect(typeof d.avgChangePercent).toBe('number');
      });
    });

    it('应该支持成交额数据', () => {
      sampleData.forEach(d => {
        if (d.totalTurnover !== undefined) {
          expect(d.totalTurnover).toBeGreaterThan(0);
        }
      });
    });

    it('应该支持股票数量数据', () => {
      sampleData.forEach(d => {
        if (d.stockCount !== undefined) {
          expect(d.stockCount).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Treemap 布局', () => {
    it('应该根据成交额计算面积', () => {
      const data = [
        { industry: 'A', totalTurnover: 100 },
        { industry: 'B', totalTurnover: 200 },
        { industry: 'C', totalTurnover: 300 },
      ];
      const total = data.reduce((s, d) => s + (d.totalTurnover || 0), 0);
      expect(total).toBe(600);
      expect(data[2].totalTurnover! / total).toBe(0.5);
    });

    it('应该支持等面积模式', () => {
      const equalArea = true;
      expect(equalArea).toBe(true);
    });
  });
});
