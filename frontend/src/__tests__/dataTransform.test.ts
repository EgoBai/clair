import { describe, it, expect } from 'vitest';

describe('数据转换与处理测试', () => {
  describe('价格格式化', () => {
    it('应该保留2位小数', () => {
      const formatPrice = (p: number) => p.toFixed(2);
      expect(formatPrice(1800)).toBe('1800.00');
      expect(formatPrice(12.5)).toBe('12.50');
      expect(formatPrice(0.01)).toBe('0.01');
    });

    it('涨跌幅应该带正负号', () => {
      const format = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
      expect(format(2.5)).toBe('+2.50%');
      expect(format(-1.23)).toBe('-1.23%');
      expect(format(0)).toBe('+0.00%');
    });
  });

  describe('市值格式化', () => {
    it('应该分万亿/亿/万三档', () => {
      const format = (v: number) => {
        if (v >= 1e12) return (v / 1e12).toFixed(2) + '万亿';
        if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
        if (v >= 1e4) return (v / 1e4).toFixed(0) + '万';
        return v.toString();
      };
      expect(format(2.5e12)).toBe('2.50万亿');
      expect(format(3.5e10)).toBe('350.00亿');
      expect(format(5e4)).toBe('5万');
    });
  });

  describe('成交量格式化', () => {
    it('应该分亿/万两档', () => {
      const format = (v: number) => {
        if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
        if (v >= 1e4) return (v / 1e4).toFixed(0) + '万';
        return v.toString();
      };
      expect(format(1.5e8)).toBe('1.50亿');
      expect(format(30000)).toBe('3万');
      expect(format(500)).toBe('500');
    });
  });

  describe('数字千分位格式化', () => {
    it('应该添加千分位逗号', () => {
      const format = (v: number) => v.toLocaleString('en-US');
      expect(format(1234567)).toBe('1,234,567');
      expect(format(1000)).toBe('1,000');
      expect(format(999)).toBe('999');
    });
  });

  describe('日期格式化', () => {
    it('应该格式化为中文日期', () => {
      const formatDate = (date: string) => {
        const [y, m, d] = date.split('-');
        return `${y}年${parseInt(m)}月${parseInt(d)}日`;
      };
      expect(formatDate('2026-03-24')).toBe('2026年3月24日');
    });

    it('相对时间应该正确', () => {
      const relative = (ts: number) => {
        const diff = Date.now() - ts;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
        return `${Math.floor(diff / 86400000)}天前`;
      };
      expect(relative(Date.now() - 10000)).toBe('刚刚');
      expect(relative(Date.now() - 120000)).toContain('分钟前');
    });
  });

  describe('涨跌着色', () => {
    it('A股红涨绿跌', () => {
      const color = (v: number) => v >= 0 ? '#ef4444' : '#22c55e';
      expect(color(1)).toBe('#ef4444');
      expect(color(-1)).toBe('#22c55e');
      expect(color(0)).toBe('#ef4444');
    });

    it('涨跌文字应该正确', () => {
      const text = (v: number) => v > 0 ? '涨' : v < 0 ? '跌' : '平';
      expect(text(1)).toBe('涨');
      expect(text(-1)).toBe('跌');
      expect(text(0)).toBe('平');
    });
  });

  describe('市场标签', () => {
    it('应该正确识别市场', () => {
      const getMarket = (symbol: string) => {
        if (symbol.startsWith('6')) return '上海';
        if (symbol.startsWith('0') || symbol.startsWith('3')) return '深圳';
        return '未知';
      };
      expect(getMarket('600519')).toBe('上海');
      expect(getMarket('000001')).toBe('深圳');
      expect(getMarket('300750')).toBe('深圳');
    });

    it('板块标签应该正确', () => {
      const getBoard = (symbol: string) => {
        if (symbol.startsWith('688')) return '科创板';
        if (symbol.startsWith('300') || symbol.startsWith('301')) return '创业板';
        return '主板';
      };
      expect(getBoard('688001')).toBe('科创板');
      expect(getBoard('300750')).toBe('创业板');
      expect(getBoard('600519')).toBe('主板');
    });
  });

  describe('技术指标数据处理', () => {
    it('MACD 柱状图应该正负着色', () => {
      const barColor = (histogram: number) => histogram >= 0 ? '#ef4444' : '#22c55e';
      expect(barColor(0.5)).toBe('#ef4444');
      expect(barColor(-0.3)).toBe('#22c55e');
    });

    it('RSI 应该区域着色', () => {
      const regionColor = (rsi: number) => {
        if (rsi >= 70) return '#ef4444'; // 超买
        if (rsi <= 30) return '#22c55e'; // 超卖
        return '#999999'; // 中性
      };
      expect(regionColor(80)).toBe('#ef4444');
      expect(regionColor(20)).toBe('#22c55e');
      expect(regionColor(50)).toBe('#999999');
    });

    it('KDJ 超买超卖线应该正确', () => {
      const lines = { overbought: 80, oversold: 20 };
      expect(lines.overbought).toBeGreaterThan(lines.oversold);
      expect(lines.overbought - lines.oversold).toBe(60);
    });
  });

  describe('K线数据验证', () => {
    it('OHLC 逻辑应该正确', () => {
      const validateOHLC = (o: number, h: number, l: number, c: number) => {
        return h >= o && h >= c && h >= l && l <= o && l <= c && l <= h;
      };
      expect(validateOHLC(100, 110, 90, 105)).toBe(true);
      expect(validateOHLC(100, 90, 110, 105)).toBe(false); // high < low
    });

    it('成交量应该是非负整数', () => {
      const validate = (v: number) => v >= 0 && Number.isInteger(v);
      expect(validate(100)).toBe(true);
      expect(validate(0)).toBe(true);
      expect(validate(-1)).toBe(false);
      expect(validate(1.5)).toBe(false);
    });

    it('成交额应该是非负数', () => {
      const validate = (v: number) => v >= 0;
      expect(validate(1000000)).toBe(true);
      expect(validate(0)).toBe(true);
      expect(validate(-100)).toBe(false);
    });
  });

  describe('图表坐标轴计算', () => {
    it('Y轴应该包含数据范围', () => {
      const data = [90, 100, 110, 95, 105];
      const min = Math.min(...data);
      const max = Math.max(...data);
      const padding = (max - min) * 0.1;
      expect(min - padding).toBeLessThan(min);
      expect(max + padding).toBeGreaterThan(max);
    });

    it('X轴时间标签应该合理间隔', () => {
      const dates = Array.from({ length: 30 }, (_, i) => `2026-03-${i + 1}`);
      const step = Math.ceil(dates.length / 6); // 显示约6个标签
      const labels = dates.filter((_, i) => i % step === 0);
      expect(labels.length).toBeLessThanOrEqual(7);
    });
  });
});
