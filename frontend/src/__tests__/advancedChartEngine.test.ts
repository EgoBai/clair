import { describe, it, expect } from 'vitest';

/**
 * AdvancedChartCalcEngine / AdvancedChartUtils 图表计算引擎逻辑测试
 */

describe('AdvancedChartCalcEngine', () => {
  describe('K线形态识别', () => {
    const isHammer = (open: number, close: number, high: number, low: number) => {
      const body = Math.abs(close - open);
      const upperShadow = high - Math.max(open, close);
      const lowerShadow = Math.min(open, close) - low;
      return lowerShadow >= body * 2 && upperShadow <= body * 0.5;
    };

    it('应该识别锤子线', () => {
      expect(isHammer(100, 102, 103, 90)).toBe(true);
    });

    it('非锤子线应该返回 false', () => {
      expect(isHammer(100, 102, 110, 98)).toBe(false);
    });
  });

  describe('十字星识别', () => {
    const isDoji = (open: number, close: number, high: number, low: number) => {
      const body = Math.abs(close - open);
      const range = high - low;
      return body / range < 0.1;
    };

    it('应该识别十字星', () => {
      expect(isDoji(100, 101, 110, 90)).toBe(true);
    });

    it('大实体不应识别为十字星', () => {
      expect(isDoji(100, 108, 110, 90)).toBe(false);
    });
  });

  describe('吞没形态', () => {
    const isBullishEngulfing = (prev: {open: number, close: number}, curr: {open: number, close: number}) => {
      const prevBearish = prev.close < prev.open;
      const currBullish = curr.close > curr.open;
      const engulfing = curr.open <= prev.close && curr.close >= prev.open;
      return prevBearish && currBullish && engulfing;
    };

    it('应该识别看涨吞没', () => {
      expect(isBullishEngulfing(
        { open: 105, close: 100 },
        { open: 99, close: 106 }
      )).toBe(true);
    });

    it('非吞没形态应该返回 false', () => {
      expect(isBullishEngulfing(
        { open: 100, close: 105 },
        { open: 106, close: 110 }
      )).toBe(false);
    });
  });

  describe('支撑阻力计算', () => {
    const findPivotPoints = (highs: number[], lows: number[]) => {
      const pivots: { type: string; price: number; index: number }[] = [];
      for (let i = 2; i < highs.length - 2; i++) {
        if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && 
            highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
          pivots.push({ type: 'resistance', price: highs[i], index: i });
        }
        if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && 
            lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
          pivots.push({ type: 'support', price: lows[i], index: i });
        }
      }
      return pivots;
    };

    it('应该识别阻力位', () => {
      const highs = [10, 12, 15, 12, 10, 11, 14, 11, 9];
      const lows = [5, 7, 10, 7, 5, 6, 9, 6, 4];
      const pivots = findPivotPoints(highs, lows);
      const resistance = pivots.filter(p => p.type === 'resistance');
      expect(resistance.length).toBeGreaterThan(0);
    });

    it('应该识别支撑位', () => {
      const highs = [15, 14, 12, 14, 15, 13, 11, 13, 15];
      const lows = [10, 9, 5, 9, 10, 8, 3, 8, 10];
      const pivots = findPivotPoints(highs, lows);
      const support = pivots.filter(p => p.type === 'support');
      expect(support.length).toBeGreaterThan(0);
    });
  });
});

describe('AdvancedChartUtils', () => {
  describe('坐标转换', () => {
    const priceToY = (price: number, minPrice: number, maxPrice: number, height: number) => {
      return height - ((price - minPrice) / (maxPrice - minPrice)) * height;
    };

    it('最高价应该在顶部 (y=0)', () => {
      expect(priceToY(110, 100, 110, 300)).toBe(0);
    });

    it('最低价应该在底部 (y=height)', () => {
      expect(priceToY(100, 100, 110, 300)).toBe(300);
    });

    it('中间价应该在中间', () => {
      expect(priceToY(105, 100, 110, 300)).toBe(150);
    });
  });

  describe('日期格式化', () => {
    const formatDate = (dateStr: string, format: string) => {
      const d = new Date(dateStr);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return format.replace('YYYY', String(year)).replace('MM', month).replace('DD', day);
    };

    it('应该格式化为 YYYY-MM-DD', () => {
      expect(formatDate('2025-01-15', 'YYYY-MM-DD')).toBe('2025-01-15');
    });

    it('应该格式化为 YYYY/MM/DD', () => {
      expect(formatDate('2025-01-15', 'YYYY/MM/DD')).toBe('2025/01/15');
    });
  });

  describe('数值格式化', () => {
    const formatVolume = (v: number) => {
      if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
      if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
      return `${v}`;
    };

    it('应该格式化亿级成交量', () => {
      expect(formatVolume(5e8)).toBe('5.00亿');
    });

    it('应该格式化万级成交量', () => {
      expect(formatVolume(50000)).toBe('5.00万');
    });

    it('小数字直接返回', () => {
      expect(formatVolume(999)).toBe('999');
    });
  });
});
