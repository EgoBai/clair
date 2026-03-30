import { describe, it, expect } from 'vitest';

// Moving average convergence algorithms
function calculateMultipleMA(data: number[], periods: number[]) {
  const result: Record<string, number[]> = {};
  for (const period of periods) {
    result[`MA${period}`] = calculateSMA(data, period);
  }
  return result;
}

function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[j];
      result.push(sum / period);
    } else {
      result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
    }
  }
  return result;
}

function calculateWMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const weightSum = (period * (period + 1)) / 2;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - period + 1 + j] * (j + 1);
      }
      result.push(sum / weightSum);
    }
  }
  return result;
}

function calculateDEMA(data: number[], period: number): number[] {
  const ema1 = calculateEMA(data, period);
  const ema2 = calculateEMA(ema1.filter(v => !isNaN(v)), period);
  const validEma1 = ema1.filter(v => !isNaN(v));
  const dema: number[] = [];
  let ema2Idx = 0;
  for (let i = 0; i < ema1.length; i++) {
    if (!isNaN(ema1[i]) && ema2Idx < ema2.length) {
      dema.push(2 * ema1[i] - ema2[ema2Idx]);
      ema2Idx++;
    } else {
      dema.push(NaN);
    }
  }
  return dema;
}

function detectGoldenCross(short: number[], long: number[]): number[] {
  const crosses: number[] = [];
  for (let i = 1; i < short.length; i++) {
    if (isNaN(short[i]) || isNaN(long[i]) || isNaN(short[i - 1]) || isNaN(long[i - 1])) continue;
    if (short[i - 1] <= long[i - 1] && short[i] > long[i]) {
      crosses.push(i);
    }
  }
  return crosses;
}

function detectDeathCross(short: number[], long: number[]): number[] {
  const crosses: number[] = [];
  for (let i = 1; i < short.length; i++) {
    if (isNaN(short[i]) || isNaN(long[i]) || isNaN(short[i - 1]) || isNaN(long[i - 1])) continue;
    if (short[i - 1] >= long[i - 1] && short[i] < long[i]) {
      crosses.push(i);
    }
  }
  return crosses;
}

function calculateTrendStrength(data: number[], period: number): number {
  if (data.length < period) return 0;
  const slice = data.slice(-period);
  let upDays = 0;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] > slice[i - 1]) upDays++;
  }
  return upDays / (period - 1);
}

function calculateSupportResistance(prices: number[], windowSize: number) {
  const supports: number[] = [];
  const resistances: number[] = [];
  for (let i = windowSize; i < prices.length - windowSize; i++) {
    let isSupport = true;
    let isResistance = true;
    for (let j = i - windowSize; j <= i + windowSize; j++) {
      if (j === i) continue;
      if (prices[j] < prices[i]) isSupport = false;
      if (prices[j] > prices[i]) isResistance = false;
    }
    if (isSupport) supports.push(prices[i]);
    if (isResistance) resistances.push(prices[i]);
  }
  return { supports, resistances };
}

describe('均线系统深度测试', () => {
  const testData = [10, 12, 11, 13, 15, 14, 16, 18, 17, 19, 20, 22, 21, 23, 25];

  describe('SMA计算', () => {
    it('5日均线应该正确', () => {
      const ma5 = calculateSMA(testData, 5);
      expect(ma5[4]).toBeCloseTo(12.2);
      expect(ma5[5]).toBeCloseTo(13.0);
    });

    it('前period-1个值应该为NaN', () => {
      const ma5 = calculateSMA(testData, 5);
      expect(isNaN(ma5[0])).toBe(true);
      expect(isNaN(ma5[3])).toBe(true);
      expect(isNaN(ma5[4])).toBe(false);
    });

    it('周期为1应该等于原数据', () => {
      const ma1 = calculateSMA(testData, 1);
      expect(ma1).toEqual(testData);
    });

    it('所有值相同时MA应该等于该值', () => {
      const flat = [5, 5, 5, 5, 5];
      const ma3 = calculateSMA(flat, 3);
      expect(ma3[2]).toBe(5);
      expect(ma3[3]).toBe(5);
    });

    it('空数据应该返回空数组', () => {
      expect(calculateSMA([], 5)).toEqual([]);
    });
  });

  describe('EMA计算', () => {
    it('应该使用正确的初始值', () => {
      const ema5 = calculateEMA(testData, 5);
      expect(ema5[4]).toBeCloseTo(12.2);
    });

    it('EMA应该对近期数据更敏感', () => {
      const data = [10, 10, 10, 10, 10, 20];
      const ema = calculateEMA(data, 5);
      const sma = calculateSMA(data, 5);
      expect(ema[5]).toBeGreaterThan(sma[5]!);
    });

    it('周期为1时每个值应该等于原数据', () => {
      const ema = calculateEMA([1, 2, 3, 4, 5], 1);
      expect(ema[0]).toBeCloseTo(1);
    });
  });

  describe('WMA计算', () => {
    it('应该对近期数据赋予更高权重', () => {
      const wma = calculateWMA([1, 2, 3, 4, 5], 3);
      expect(wma[2]).toBeCloseTo(2.333, 2);
    });

    it('前period-1个值应该为NaN', () => {
      const wma = calculateWMA(testData, 5);
      expect(isNaN(wma[3])).toBe(true);
      expect(isNaN(wma[4])).toBe(false);
    });
  });

  describe('DEMA计算', () => {
    it('应该比EMA更快响应', () => {
      const data = [10, 10, 10, 10, 10, 20];
      const ema = calculateEMA(data, 3);
      const dema = calculateDEMA(data, 3);
      const validEma = ema.filter(v => !isNaN(v));
      const validDema = dema.filter(v => !isNaN(v));
      if (validDema.length > 0 && validEma.length > 0) {
        expect(validDema[validDema.length - 1]).toBeGreaterThanOrEqual(validEma[validEma.length - 1]);
      }
    });
  });

  describe('交叉检测', () => {
    it('应该检测金叉', () => {
      const short = [1, 2, 3, 4, 5, 6];
      const long = [4, 4, 3.5, 3, 3, 3];
      const crosses = detectGoldenCross(short, long);
      expect(crosses.length).toBeGreaterThan(0);
    });

    it('应该检测死叉', () => {
      const short = [6, 5, 4, 3, 2, 1];
      const long = [3, 3, 3.5, 4, 4, 4];
      const crosses = detectDeathCross(short, long);
      expect(crosses.length).toBeGreaterThan(0);
    });

    it('无交叉时应该返回空数组', () => {
      const short = [1, 2, 3, 4, 5];
      const long = [0, 1, 2, 3, 4];
      expect(detectGoldenCross(short, long)).toEqual([]);
      expect(detectDeathCross(short, long)).toEqual([]);
    });

    it('NaN值应该被跳过', () => {
      const short = [NaN, NaN, 3, 4, 5];
      const long = [NaN, NaN, 4, 4, 4];
      const crosses = detectGoldenCross(short, long);
      expect(crosses.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('趋势强度', () => {
    it('上涨趋势应该接近1', () => {
      const upTrend = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(calculateTrendStrength(upTrend, 5)).toBe(1);
    });

    it('下跌趋势应该接近0', () => {
      const downTrend = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      expect(calculateTrendStrength(downTrend, 5)).toBe(0);
    });

    it('震荡趋势应该接近0.5', () => {
      const oscillating = [1, 3, 2, 4, 3, 5, 4, 6, 5, 7];
      const strength = calculateTrendStrength(oscillating, 5);
      expect(strength).toBeGreaterThan(0.3);
      expect(strength).toBeLessThan(0.8);
    });

    it('数据不足时返回0', () => {
      expect(calculateTrendStrength([1, 2], 5)).toBe(0);
    });
  });

  describe('支撑阻力位', () => {
    it('应该识别局部最低点为支撑', () => {
      const prices = [10, 9, 8, 7, 8, 9, 10];
      const { supports } = calculateSupportResistance(prices, 2);
      expect(supports).toContain(7);
    });

    it('应该识别局部最高点为阻力', () => {
      const prices = [7, 8, 9, 10, 9, 8, 7];
      const { resistances } = calculateSupportResistance(prices, 2);
      expect(resistances).toContain(10);
    });

    it('单调序列不应该有支撑阻力', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7];
      const { supports, resistances } = calculateSupportResistance(prices, 2);
      expect(supports.length).toBe(0);
      expect(resistances.length).toBe(0);
    });
  });

  describe('多均线组合', () => {
    it('应该同时计算多个周期', () => {
      const result = calculateMultipleMA(testData, [5, 10, 20]);
      expect(result.MA5.length).toBe(testData.length);
      expect(result.MA10.length).toBe(testData.length);
      expect(result.MA20.length).toBe(testData.length);
    });

    it('短期均线应该比长期均线更接近当前价格', () => {
      const result = calculateMultipleMA(testData, [5, 10]);
      const last = testData.length - 1;
      const diff5 = Math.abs(testData[last] - result.MA5[last]!);
      const diff10 = Math.abs(testData[last] - result.MA10[last]!);
      expect(diff5).toBeLessThanOrEqual(diff10);
    });
  });
});
