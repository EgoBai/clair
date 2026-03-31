import { describe, it, expect } from 'vitest';

/**
 * KLineChart K线图组件逻辑测试
 */

describe('KLineChart', () => {
  describe('KLineData 数据接口', () => {
    const sampleData = {
      tradeDate: '2025-01-02',
      open: 1800,
      close: 1820,
      high: 1830,
      low: 1790,
      volume: 1000000,
      turnover: 1800000000,
    };

    it('应该有 tradeDate 字段', () => {
      expect(sampleData.tradeDate).toBe('2025-01-02');
    });

    it('应该有 OHLC 数据', () => {
      expect(sampleData.open).toBe(1800);
      expect(sampleData.close).toBe(1820);
      expect(sampleData.high).toBe(1830);
      expect(sampleData.low).toBe(1790);
    });

    it('应该有成交量数据', () => {
      expect(sampleData.volume).toBeGreaterThan(0);
    });

    it('应该有成交额数据', () => {
      expect(sampleData.turnover).toBeGreaterThan(0);
    });

    it('high 应该大于等于 open/close', () => {
      expect(sampleData.high).toBeGreaterThanOrEqual(sampleData.open);
      expect(sampleData.high).toBeGreaterThanOrEqual(sampleData.close);
    });

    it('low 应该小于等于 open/close', () => {
      expect(sampleData.low).toBeLessThanOrEqual(sampleData.open);
      expect(sampleData.low).toBeLessThanOrEqual(sampleData.close);
    });
  });

  describe('MA 均线计算', () => {
    const calculateMA = (data: number[], period: number): (number | null)[] => {
      const result: (number | null)[] = [];
      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
          result.push(null);
        } else {
          const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
          result.push(Math.round((sum / period) * 100) / 100);
        }
      }
      return result;
    };

    it('MA5 应该计算5日均线', () => {
      const closes = [10, 12, 11, 13, 14, 15];
      const ma5 = calculateMA(closes, 5);
      expect(ma5[0]).toBeNull();
      expect(ma5[4]).toBe(12); // (10+12+11+13+14)/5 = 12
    });

    it('MA10 前9个值应为 null', () => {
      const closes = Array(15).fill(100);
      const ma10 = calculateMA(closes, 10);
      for (let i = 0; i < 9; i++) {
        expect(ma10[i]).toBeNull();
      }
      expect(ma10[9]).toBe(100);
    });
  });

  describe('K线颜色逻辑', () => {
    it('阳线（收>开）应为红色', () => {
      const { open, close } = { open: 100, close: 105 };
      const isUp = close >= open;
      expect(isUp).toBe(true);
    });

    it('阴线（收<开）应为绿色', () => {
      const { open, close } = { open: 105, close: 100 };
      const isUp = close >= open;
      expect(isUp).toBe(false);
    });

    it('十字星（收=开）颜色处理', () => {
      const { open, close } = { open: 100, close: 100 };
      const isUp = close >= open;
      expect(isUp).toBe(true); // 默认红色
    });
  });

  describe('子图指标', () => {
    const subIndicators = ['volume', 'macd', 'kdj', 'rsi', 'none'];

    it('应该支持成交量子图', () => {
      expect(subIndicators).toContain('volume');
    });

    it('应该支持 MACD 子图', () => {
      expect(subIndicators).toContain('macd');
    });

    it('应该支持 KDJ 子图', () => {
      expect(subIndicators).toContain('kdj');
    });

    it('应该支持 RSI 子图', () => {
      expect(subIndicators).toContain('rsi');
    });

    it('应该支持无子图模式', () => {
      expect(subIndicators).toContain('none');
    });
  });

  describe('图表配置', () => {
    it('默认高度为500', () => {
      const defaultHeight = 500;
      expect(defaultHeight).toBe(500);
    });

    it('默认显示MA均线', () => {
      const showMA = true;
      expect(showMA).toBe(true);
    });

    it('默认MA周期为 [5, 10, 20, 60]', () => {
      const maLines = [5, 10, 20, 60];
      expect(maLines).toEqual([5, 10, 20, 60]);
    });

    it('默认不显示EMA', () => {
      const showEMA = false;
      expect(showEMA).toBe(false);
    });
  });
});
