/**
 * 影子测试迁移（批次 24b）
 *
 * 旧文件只 import vitest，自抄 SMA/EMA/WMA/DEMA/交叉/趋势强度/支撑阻力七套实现，断言对象是副本。
 * SMA/EMA 两组改为 import 产品仓真实实现；其余生产无同签名导出，保留本地 helper 并逐处注明。
 *
 * 已绑定生产实现：
 * - calculateSMA → frontend/src/utils/chartDataProcessing.ts:73（返回 (number|null)[]，null 预热）
 * - calculateEMA → frontend/src/utils/chartDataProcessing.ts:89
 *   （该模块为无依赖纯函数，跨包 import 先例见 backend/src/__tests__/maAndVolumeAnalysis.test.ts:39。
 *    未选 backend/src/indicators/technical.ts:120/139 的同名 calculateMA/calculateEMA：后者每步
 *    parseFloat(x.toFixed(4)) 舍入到 4 位，口径不同。）
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * - SMA 预热值：旧副本 NaN → 生产 chartDataProcessing 为 null。
 *   isNaN(ma5[0]) === true → toBeNull()；isNaN(ma5[4]) === false → not.toBeNull()。
 *   原因：chartDataProcessing.ts:73-84 用 null 表示 period-1 个预热位。
 * - EMA 预热值：旧副本 NaN → 生产 null；本组只用第 4/5 位与 period=1，数值断言不变。
 * - 其余数值断言与旧副本一致（EMA 以 period 个 SMA 播种、multiplier=2/(period+1)），未改。
 *
 * 未迁移（生产无对应导出 / 契约不同，保留本地 helper）：
 * - calculateMultipleMA：生产只有固定 5/10/20/60/120/250 周期的 calculateAllMAs
 *   （frontend/src/utils/trendFollowingEngine.ts:89，入参 PriceData[]），无任意周期组合导出；
 *   本地 helper 组合生产 calculateSMA。
 * - calculateWMA：全仓无导出（grep calculateWMA 仅命中测试），保留旧副本（NaN 预热）。
 * - calculateDEMA：生产无 DEMA 导出；本地组合生产 calculateEMA（null 口径）。
 * - detectGoldenCross / detectDeathCross：生产只有趋势引擎的 detectCrossovers
 *   （frontend/src/utils/trendFollowingEngine.ts:113，入参 MAValues[]、返回 TrendSignal[]）与
 *   marketTimingEngine.ts:163/167 的 MA50/200 专用布尔判断，与 (number[])→number[] 通用签名不同。
 * - calculateTrendStrength：生产 frontend/src/utils/trendFollowingEngine.ts:169 入参为 MA 序列、
 *   返回 TrendStrength 对象（0-100 评分 + 排列度 + ADX 近似），与「近 period 日上涨占比」口径不同。
 * - calculateSupportResistance：生产只有 backend/src/services/patternRecognitionEngine.ts:261 的
 *   class 方法 findSupportResistance（入参 PricePoint[]、返回带 type/strength 的对象数组），
 *   无同签名纯函数导出。
 */

import { describe, it, expect } from 'vitest';
import { calculateEMA, calculateSMA } from '../../../frontend/src/utils/chartDataProcessing';

// 未迁移：生产无任意周期组合导出（calculateAllMAs 只算固定 5/10/20/60/120/250）；
// 本地 helper 仅按周期组合生产 calculateSMA，不重复算法。
function calculateMultipleMA(data: number[], periods: number[]): Record<string, (number | null)[]> {
  const result: Record<string, (number | null)[]> = {};
  for (const period of periods) {
    result[`MA${period}`] = calculateSMA(data, period);
  }
  return result;
}

// 未迁移：生产无 WMA 导出，保留旧副本（NaN 预热，未对齐生产 null 口径）。
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

// 未迁移：生产无 DEMA 导出；仅做 2*EMA1 - EMA2 组合，EMA 来自生产实现（null 口径）。
function calculateDEMA(data: number[], period: number): (number | null)[] {
  const ema1 = calculateEMA(data, period);
  const ema1Values = ema1.map((v, i) => (v !== null ? v : data[i]));
  const ema2 = calculateEMA(ema1Values, period);
  return ema1.map((v, i) => {
    const e2 = ema2[i];
    if (v === null || e2 === null) return null;
    return 2 * v - e2;
  });
}

// 未迁移：生产无通用金叉/死叉检测导出（detectCrossovers 是 MAValues[]→TrendSignal[] 的专用契约），
// 保留旧副本的 (number[])→索引数组 签名与 NaN 跳过逻辑。
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

// 未迁移：生产 calculateTrendStrength（trendFollowingEngine.ts:169）入参与返回均为另一套契约，
// 保留旧副本「近 period 日上涨天数占比」的本地 helper。
function calculateTrendStrength(data: number[], period: number): number {
  if (data.length < period) return 0;
  const slice = data.slice(-period);
  let upDays = 0;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] > slice[i - 1]) upDays++;
  }
  return upDays / (period - 1);
}

// 未迁移：生产只有 patternRecognitionEngine 的 class 方法 findSupportResistance（返回对象数组），
// 无同签名纯函数导出。
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

    it('前period-1个值应该为null', () => {
      const ma5 = calculateSMA(testData, 5);
      expect(ma5[0]).toBeNull();
      expect(ma5[3]).toBeNull();
      expect(ma5[4]).not.toBeNull();
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
      const validEma = ema.filter((v): v is number => v !== null);
      const validDema = dema.filter((v): v is number => v !== null);
      expect(validDema.length).toBeGreaterThan(0);
      expect(validEma.length).toBeGreaterThan(0);
      expect(validDema[validDema.length - 1]).toBeGreaterThanOrEqual(validEma[validEma.length - 1]);
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
