import { describe, it, expect } from 'vitest';

// 市场状态检测引擎测试
describe('市场状态检测引擎', () => {
  describe('趋势强度检测', () => {
    function trendStrength(prices: number[]): { direction: 'up' | 'down' | 'sideways'; strength: number } {
      if (prices.length < 2) return { direction: 'sideways', strength: 0 };
      let upCount = 0, downCount = 0;
      for (let i = 1; i < prices.length; i++) {
        if (prices[i] > prices[i - 1]) upCount++;
        else if (prices[i] < prices[i - 1]) downCount++;
      }
      const total = prices.length - 1;
      const ratio = (upCount - downCount) / total;
      if (ratio > 0.3) return { direction: 'up', strength: ratio };
      if (ratio < -0.3) return { direction: 'down', strength: Math.abs(ratio) };
      return { direction: 'sideways', strength: 1 - Math.abs(ratio) };
    }

    it('持续上涨检测为上升趋势', () => {
      const r = trendStrength([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(r.direction).toBe('up');
      expect(r.strength).toBe(1);
    });

    it('持续下跌检测为下降趋势', () => {
      expect(trendStrength([10, 9, 8, 7, 6, 5]).direction).toBe('down');
    });

    it('震荡行情检测为横盘', () => {
      expect(trendStrength([10, 11, 10, 11, 10, 11, 10]).direction).toBe('sideways');
    });

    it('空数据返回横盘', () => {
      expect(trendStrength([]).direction).toBe('sideways');
    });

    it('单个价格返回横盘', () => {
      expect(trendStrength([100]).direction).toBe('sideways');
    });

    it('强度在0-1范围内', () => {
      const r = trendStrength([1, 3, 2, 4, 3, 5]);
      expect(r.strength).toBeGreaterThanOrEqual(0);
      expect(r.strength).toBeLessThanOrEqual(1);
    });
  });

  describe('波动率状态分类', () => {
    function volatilityRegime(returns: number[]): 'low' | 'normal' | 'high' | 'extreme' {
      if (returns.length < 2) return 'normal';
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
      if (std < 0.005) return 'low';
      if (std < 0.015) return 'normal';
      if (std < 0.03) return 'high';
      return 'extreme';
    }

    it('零收益率为低波动', () => {
      expect(volatilityRegime([0, 0, 0, 0])).toBe('low');
    });

    it('大幅波动为极端波动', () => {
      expect(volatilityRegime([0.1, -0.1, 0.12, -0.08, 0.15])).toBe('extreme');
    });

    it('正常波动范围', () => {
      expect(volatilityRegime([0.01, -0.005, 0.008, -0.003])).toBe('normal');
    });

    it('空数据返回normal', () => {
      expect(volatilityRegime([])).toBe('normal');
    });
  });

  describe('支撑阻力位检测', () => {
    function findSupportResistance(prices: number[], windowSize = 3): { support: number[]; resistance: number[] } {
      const support: number[] = [], resistance: number[] = [];
      for (let i = windowSize; i < prices.length - windowSize; i++) {
        const leftMin = Math.min(...prices.slice(i - windowSize, i));
        const rightMin = Math.min(...prices.slice(i + 1, i + windowSize + 1));
        if (prices[i] <= leftMin && prices[i] <= rightMin) support.push(prices[i]);
        const leftMax = Math.max(...prices.slice(i - windowSize, i));
        const rightMax = Math.max(...prices.slice(i + 1, i + windowSize + 1));
        if (prices[i] >= leftMax && prices[i] >= rightMax) resistance.push(prices[i]);
      }
      return { support, resistance };
    }

    it('找到支撑位', () => {
      const prices = [10, 12, 8, 13, 7, 14, 9, 15];
      const result = findSupportResistance(prices);
      expect(result.support.length).toBeGreaterThan(0);
    });

    it('找到阻力位', () => {
      const prices = [10, 8, 7, 15, 8, 7, 9, 5];
      const result = findSupportResistance(prices);
      expect(result.resistance.length).toBeGreaterThan(0);
    });

    it('单调序列无支撑阻力', () => {
      const prices = Array.from({ length: 20 }, (_, i) => i);
      const result = findSupportResistance(prices);
      expect(result.support.length + result.resistance.length).toBe(0);
    });

    it('数据不足返回空', () => {
      const result = findSupportResistance([1, 2, 3], 5);
      expect(result.support).toHaveLength(0);
      expect(result.resistance).toHaveLength(0);
    });
  });

  describe('缺口检测', () => {
    interface Bar { open: number; high: number; low: number; close: number; }

    function detectGaps(bars: Bar[]): { upGaps: number[]; downGaps: number[] } {
      const upGaps: number[] = [], downGaps: number[] = [];
      for (let i = 1; i < bars.length; i++) {
        if (bars[i].low > bars[i - 1].high) upGaps.push(i);
        else if (bars[i].high < bars[i - 1].low) downGaps.push(i);
      }
      return { upGaps, downGaps };
    }

    it('检测向上跳空', () => {
      const bars: Bar[] = [
        { open: 10, high: 11, low: 9, close: 10.5 },
        { open: 13, high: 14, low: 12, close: 13.5 },
      ];
      expect(detectGaps(bars).upGaps).toContain(1);
    });

    it('检测向下跳空', () => {
      const bars: Bar[] = [
        { open: 13, high: 14, low: 12, close: 13 },
        { open: 10, high: 11, low: 9, close: 10 },
      ];
      expect(detectGaps(bars).downGaps).toContain(1);
    });

    it('连续K线无缺口', () => {
      const bars: Bar[] = [
        { open: 10, high: 11, low: 9, close: 10.5 },
        { open: 10.2, high: 11.5, low: 9.5, close: 11 },
      ];
      const r = detectGaps(bars);
      expect(r.upGaps).toHaveLength(0);
      expect(r.downGaps).toHaveLength(0);
    });

    it('空数据无缺口', () => {
      expect(detectGaps([]).upGaps).toHaveLength(0);
    });
  });

  describe('量价背离检测', () => {
    function detectDivergence(prices: number[], volumes: number[]): 'bullish' | 'bearish' | 'none' {
      if (prices.length < 4) return 'none';
      const mid = Math.floor(prices.length / 2);
      const priceFirstHalf = prices.slice(0, mid);
      const priceSecondHalf = prices.slice(mid);
      const volFirstHalf = volumes.slice(0, mid);
      const volSecondHalf = volumes.slice(mid);
      const priceUp = priceSecondHalf[priceSecondHalf.length - 1] > priceFirstHalf[priceFirstHalf.length - 1];
      const volDown = volSecondHalf.reduce((a, b) => a + b, 0) / volSecondHalf.length <
                      volFirstHalf.reduce((a, b) => a + b, 0) / volFirstHalf.length;
      if (priceUp && volDown) return 'bearish';
      if (!priceUp && !volDown) return 'bullish';
      return 'none';
    }

    it('价升量缩为看跌背离', () => {
      expect(detectDivergence([10, 11, 12, 15, 16, 17], [100, 90, 80, 50, 40, 30])).toBe('bearish');
    });

    it('价跌量增为看涨背离', () => {
      expect(detectDivergence([17, 16, 15, 12, 11, 10], [30, 40, 50, 80, 90, 100])).toBe('bullish');
    });

    it('量价同步无背离', () => {
      expect(detectDivergence([10, 11, 12, 13, 14, 15], [100, 110, 120, 130, 140, 150])).toBe('none');
    });

    it('数据不足无背离', () => {
      expect(detectDivergence([1, 2], [100, 200])).toBe('none');
    });
  });

  describe('市场宽度指标', () => {
    function marketBreadth(advances: number, declines: number, unchanged: number): {
      adRatio: number;
      breadth: number;
      status: string;
    } {
      const total = advances + declines + unchanged;
      const adRatio = declines === 0 ? advances : advances / declines;
      const breadth = total === 0 ? 0 : ((advances - declines) / total) * 100;
      let status = 'neutral';
      if (breadth > 40) status = 'very_bullish';
      else if (breadth > 15) status = 'bullish';
      else if (breadth < -40) status = 'very_bearish';
      else if (breadth < -15) status = 'bearish';
      return { adRatio, breadth, status };
    }

    it('涨远多于跌为强势', () => {
      expect(marketBreadth(800, 100, 100).status).toBe('very_bullish');
    });

    it('跌远多于涨为弱势', () => {
      expect(marketBreadth(100, 800, 100).status).toBe('very_bearish');
    });

    it('涨跌均衡为中性', () => {
      expect(marketBreadth(500, 500, 0).status).toBe('neutral');
    });

    it('跌为零时涨跌比为涨家数', () => {
      expect(marketBreadth(100, 0, 50).adRatio).toBe(100);
    });

    it('全为零返回零', () => {
      expect(marketBreadth(0, 0, 0).breadth).toBe(0);
    });
  });
});
