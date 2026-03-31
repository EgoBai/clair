import { describe, it, expect } from 'vitest';

/**
 * 市场广度分析测试
 */

interface BreadthData {
  advancing: number;
  declining: number;
  unchanged: number;
  totalStocks: number;
  newHighs: number;
  newLows: number;
  aboveMA20: number;
  aboveMA60: number;
  aboveMA250: number;
  adLine: number;      // 腾落线
  adRatio: number;     // 涨跌比
  mcclellanOsc: number; // 麦克莱伦振荡器
}

function calcAdvanceDeclineRatio(data: BreadthData): number {
  return data.declining > 0 ? data.advancing / data.declining : data.advancing;
}

function calcBreadthScore(data: BreadthData): number {
  const adScore = calcAdvanceDeclineRatio(data);
  const highLowScore = data.totalStocks > 0 ? (data.newHighs - data.newLows) / data.totalStocks * 100 : 0;
  const maScore = data.totalStocks > 0
    ? ((data.aboveMA20 + data.aboveMA60 + data.aboveMA250) / (data.totalStocks * 3)) * 100
    : 0;
  return Math.round((adScore * 0.4 + highLowScore * 0.3 + maScore * 0.3) * 100) / 100;
}

function getBreadthSignal(score: number): 'bullish' | 'bearish' | 'neutral' {
  if (score > 1.5) return 'bullish';
  if (score < 0.7) return 'bearish';
  return 'neutral';
}

function detectDivergence(priceChange: number, breadthChange: number): 'bullish' | 'bearish' | 'none' {
  if (priceChange > 0 && breadthChange < -0.05) return 'bearish';
  if (priceChange < 0 && breadthChange > 0.05) return 'bullish';
  return 'none';
}

describe('Market Breadth Analysis', () => {
  const bullishData: BreadthData = {
    advancing: 2500,
    declining: 800,
    unchanged: 200,
    totalStocks: 3500,
    newHighs: 150,
    newLows: 20,
    aboveMA20: 2800,
    aboveMA60: 2500,
    aboveMA250: 2200,
    adLine: 5000,
    adRatio: 3.125,
    mcclellanOsc: 50,
  };

  const bearishData: BreadthData = {
    advancing: 600,
    declining: 2700,
    unchanged: 200,
    totalStocks: 3500,
    newHighs: 10,
    newLows: 200,
    aboveMA20: 800,
    aboveMA60: 600,
    aboveMA250: 500,
    adLine: -3000,
    adRatio: 0.22,
    mcclellanOsc: -80,
  };

  describe('涨跌比', () => {
    it('应该正确计算涨跌比', () => {
      const ratio = calcAdvanceDeclineRatio(bullishData);
      expect(ratio).toBeCloseTo(3.125, 2);
    });

    it('下跌为0时应该返回上涨数', () => {
      const data: BreadthData = { ...bullishData, declining: 0 };
      expect(calcAdvanceDeclineRatio(data)).toBe(2500);
    });

    it('熊市涨跌比应该小于1', () => {
      const ratio = calcAdvanceDeclineRatio(bearishData);
      expect(ratio).toBeLessThan(1);
    });
  });

  describe('广度评分', () => {
    it('牛市应该有较高评分', () => {
      const score = calcBreadthScore(bullishData);
      expect(score).toBeGreaterThan(1);
    });

    it('熊市评分应该低于牛市', () => {
      const bullScore = calcBreadthScore(bullishData);
      const bearScore = calcBreadthScore(bearishData);
      expect(bearScore).toBeLessThan(bullScore);
    });

    it('空数据应该返回0', () => {
      const emptyData: BreadthData = {
        advancing: 0, declining: 0, unchanged: 0, totalStocks: 0,
        newHighs: 0, newLows: 0, aboveMA20: 0, aboveMA60: 0, aboveMA250: 0,
        adLine: 0, adRatio: 0, mcclellanOsc: 0,
      };
      const score = calcBreadthScore(emptyData);
      expect(score).toBe(0);
    });
  });

  describe('广度信号', () => {
    it('高评分应该返回bullish', () => {
      expect(getBreadthSignal(2.0)).toBe('bullish');
    });

    it('低评分应该返回bearish', () => {
      expect(getBreadthSignal(0.3)).toBe('bearish');
    });

    it('中等评分应该返回neutral', () => {
      expect(getBreadthSignal(1.0)).toBe('neutral');
    });
  });

  describe('背离检测', () => {
    it('价格涨但广度跌应该检测到熊背离', () => {
      expect(detectDivergence(2, -0.1)).toBe('bearish');
    });

    it('价格跌但广度涨应该检测到牛背离', () => {
      expect(detectDivergence(-2, 0.1)).toBe('bullish');
    });

    it('同向变动应该无背离', () => {
      expect(detectDivergence(2, 0.1)).toBe('none');
      expect(detectDivergence(-2, -0.1)).toBe('none');
    });
  });

  describe('数据完整性', () => {
    it('涨跌平之和应该等于总数', () => {
      const total = bullishData.advancing + bullishData.declining + bullishData.unchanged;
      expect(total).toBe(bullishData.totalStocks);
    });

    it('新高新低不应该超过总数', () => {
      expect(bullishData.newHighs).toBeLessThanOrEqual(bullishData.totalStocks);
      expect(bullishData.newLows).toBeLessThanOrEqual(bullishData.totalStocks);
    });

    it('均线以上数量不应该超过总数', () => {
      expect(bullishData.aboveMA20).toBeLessThanOrEqual(bullishData.totalStocks);
      expect(bullishData.aboveMA60).toBeLessThanOrEqual(bullishData.totalStocks);
      expect(bullishData.aboveMA250).toBeLessThanOrEqual(bullishData.totalStocks);
    });
  });
});
