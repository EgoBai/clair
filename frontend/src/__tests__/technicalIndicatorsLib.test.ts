/**
 * 影子测试迁移（批次 34b）
 *
 * 旧文件只 import vitest，自抄 RSI / EMA / MACD / BOLL / Stochastic / ATR / OBV / zScore /
 * normalize / detectTrend 十套实现，断言对象是副本。本批全部改为 import 产品仓真实实现
 * （跨包 import 先例：frontend/src/__tests__/chartDataProcessingDeep.test.ts:57 已 import
 * backend/src/services/zScoreEngine）；清洗/时序另有 6 个符号生产无同契约导出，保留本地 helper
 * 并在「未迁移」节逐条注明。
 *
 * 已绑定生产实现（唯一真源）：
 * - RSI → backend/src/services/chartDataEngine.ts:36-53 calcRSI(data, period)
 *   （不足 period+1 返回 []，Wilder 平滑，avgLoss===0 时取 100，:45/:50）。
 *   同口径备选 backend/src/services/momentumDivergenceEngine.ts:36 calculateRSI 逐行等价；
 *   选 chartDataEngine 因同一模块还提供本文件 BOLL 绑定。
 * - EMA → frontend/src/utils/featureEngineeringEngine.ts:45-58 calculateEMA(prices, period)
 *   （prices[0] 播种、multiplier=2/(period+1)、无 padding、纯 number[]）。
 * - MACD → frontend/src/utils/featureEngineeringEngine.ts:85-103 calculateMACD(prices, fast=12, slow=26, signal=9)
 *   返回 { macd, signal, histogram }（三者全长度；histogram = macd - signal，:99，不乘 2）。
 * - BOLL → backend/src/services/chartDataEngine.ts:25-34 calcBollingerBands(data, period, mult)
 *   返回 { upper, mid, lower }[]（中轨为 period 均值，标准差除以 period，:30；无 padding，从 index period-1 起）。
 *   未选 frontend/src/utils/chartDataProcessing.ts:145（同形但前 period-1 位为 null）与
 *   frontend/src/utils/featureEngineeringEngine.ts:104（{upper[],middle[],lower[]} + NaN padding），契约不同。
 * - Stochastic → backend/src/services/momentumDivergenceEngine.ts:107-133 calculateStochastic(highs, lows, closes, 14, 3)
 *   返回 { k, d }（closes 不足 kPeriod 返回 {k:[],d:[]}，:114；k 从 index 13 起、d 从 dPeriod-1 起，无 NaN）。
 * - ATR → backend/src/indicators/technical.ts:461-495 calculateATR(high, low, close, period=14)
 *   返回 { atr: (number|null)[], trueRange: (number|null)[] }：TR 从 i=1 起算（:473-474）、
 *   atr 前 period 位为 null（:471/:489）、首值 = 前 period 个 TR 的简单平均（:485-489）、
 *   之后 Wilder 平滑（:491-492）、每步 toFixed(4)（:489/:492）。
 *   未选 frontend/src/utils/featureEngineeringEngine.ts:136（TR 含 i=0、返回 SMA 非 Wilder）与
 *   frontend/src/utils/trendFollowingEngine.ts:376（入参 PriceData[]、SMA）——均非 Wilder 口径。
 * - OBV → frontend/src/utils/featureEngineeringEngine.ts:156-170 calculateOBV(close, volume)
 *   （首值 = volume[0]，:157；按收盘涨跌加减成交量）。
 * - Z-Score → backend/src/services/zScoreEngine.ts:10-16 zScoreSeries(data)
 *   （总体标准差 /n，:14；std=0 → 0；每项 Math.round(z*10000)/10000，:15）。
 *   另一套 contract：backend/src/utils/futureValueUtils.ts:19 zScore(value, mean, std) 为标量版（std===0→0）；
 *   frontend/src/utils/dataFlowEngine.ts:209 zScoreNormalize 为同口径数组版（总体 + 4 位舍入），语义等价，未选。
 * - 归一化 → frontend/src/utils/dataFlowEngine.ts:220-226 minMaxNormalize(data)
 *   （min-max 映射 + 4 位舍入；range===0 时全 0，:225）。
 *   未选 backend/src/services/chartDataEngine.ts:55-59 normalizeToRange(data, min, max)：常量序列返回
 *   (min+max)/2（:57），与旧用例「恒定数据归一化为 0」的语义不一致。
 * - 趋势检测 → frontend/src/utils/regimeDetectionEngine.ts:53-99 detectTrend(prices, window=20)
 *   （n<window 直接返回 {direction:'neutral'}，:55-57；线性回归斜率 slope>0.01→'up'、slope<-0.01→'down'、
 *   否则 'neutral'，:96；入参 number[]，返回 TrendAnalysis 对象，:99）。
 *
 * 旧断言订正（旧值 → 生产值 + 依据）：
 * 1. BOLL 中轨属性名：旧 bands[i].middle → 生产 bands[i].mid（chartDataEngine.ts:31），断言数不变。
 * 2. MACD 字段名：旧 { dif, dea, histogram } → 生产 { macd, signal, histogram }
 *   （featureEngineeringEngine.ts:101）；旧 dif 截取 slow-1 之后、柱值乘 2，生产三者全长度、柱值不乘 2。
 *   长度断言不受影响；新增 histogram = macd - signal 的断言绑定该口径（:99）。
 * 3. ATR 返回形状：旧 number[] → 生产 { atr, trueRange }，atr 与输入等长、前 period 位为 null
 *   （technical.ts:471/:489）；用例改取 .atr 并过滤 null，数值口径一致（首值+Wilder），
 *   仅多一层 4 位舍入（:489/:492）。
 * 4. Z-Score 精度：旧不取整 → 生产每项 4 位舍入（zScoreEngine.ts:15）；均值断言仍成立
 *   （对称序列舍入后和为 0），另新增精确值断言 -1.4142 / 1.4142。
 * 5. 趋势返回值：旧返回 'up' | 'down' | 'flat' 字符串 → 生产返回 TrendAnalysis 对象，
 *   方向字段为 'up' | 'down' | 'neutral'（regimeDetectionEngine.ts:27-38、:96）；断言改取 .direction，
 *   旧 'flat' → 生产 'neutral'。生产默认 window=20，n<20 直接 neutral（:55-57），
 *   故 10 点夹具显式传 window=10 以保留原序列。
 * 6. OBV 空输入：旧 [] → 生产 calculateOBV([], []) 返回 [undefined]
 *   （首值取 volume[0]，featureEngineeringEngine.ts:157）；用例改断言 length 1 + 第 0 位 undefined，
 *   归入「生产缺口」。
 * 7. 归一化：minMaxNormalize 与旧副本逐行同口径（含 range===0 → 全 0），两条断言均未改；仅补生产来源注释。
 *
 * 未迁移（生产无同契约导出，保留本地 helper）：
 * - removeDuplicates<T>(data, key)：生产去重均为领域专用（frontend/src/utils/newsAggregationEngine.ts:48
 *   deduplicateNews、frontend/src/utils/tradeSignalNotificationEngine.ts:62 deduplicateSignals、
 *   frontend/src/config/pageIndex.ts:55 私有 dedupe），无泛型 key 去重导出。
 * - fillMissingValues(data, 'mean'|'median'|'zero')：rg fillMissing|impute 0 命中。
 * - smooth(data, window)：生产无居中窗口平滑导出（backend/src/services/orderFlowToxicityEngine.ts:161
 *   smoothVPIN 为系数平滑，契约不同）。
 * - linearInterpolate：rg linearInterpolate 仅命中本测试；interpolat 仅命中 i18n 模板、volSurface 双线性等
 *   不同契约（与 frontend/src/__tests__/chartDataProcessingDeep.test.ts 批次 30a 的未迁移结论一致）。
 * - movingAverage(TimePoint[], period)：生产 calculateMA 为 number[] → number[]（backend/src/utils/futureValueUtils.ts:32），
 *   不保留 timestamp；trendFollowingEngine 的均线入参为 PriceData[]，契约不同。
 * - exponentialSmoothing(TimePoint[], alpha)：rg exponentialSmoothing 无导出，无同契约实现。
 *
 * 生产缺口（未改生产代码，仅记录）：
 * - calculateOBV 空输入未守卫，返回 [undefined] 而非 []（frontend/src/utils/featureEngineeringEngine.ts:156-157）。
 * - normalizeToRange 常量序列返回中值 0.5 而非 0（backend/src/services/chartDataEngine.ts:57）——本文件未绑定该符号，
 *   记录以便与 dataFlowEngine.minMaxNormalize 的口径差异对照。
 */

import { describe, it, expect } from 'vitest';
import { calcRSI, calcBollingerBands } from '../../../backend/src/services/chartDataEngine';
import { calculateEMA, calculateMACD, calculateOBV } from '../utils/featureEngineeringEngine';
import { calculateStochastic } from '../../../backend/src/services/momentumDivergenceEngine';
import { calculateATR } from '../../../backend/src/indicators/technical';
import { zScoreSeries } from '../../../backend/src/services/zScoreEngine';
import { minMaxNormalize } from '../utils/dataFlowEngine';
import { detectTrend } from '../utils/regimeDetectionEngine';

// 技术指标计算库
describe('技术指标计算库', () => {
  it('RSI应返回0-100范围', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calcRSI(prices, 14);
    expect(result.every(v => v >= 0 && v <= 100)).toBe(true);
  });

  it('持续上涨RSI应接近100', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calcRSI(prices, 14);
    expect(result[result.length - 1]).toBeGreaterThan(80);
  });

  it('持续下跌RSI应接近0', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 200 - i);
    const result = calcRSI(prices, 14);
    expect(result[result.length - 1]).toBeLessThan(20);
  });

  it('数据不足RSI应返回空', () => {
    expect(calcRSI([1, 2, 3], 14)).toHaveLength(0);
  });

  it('EMA应正确计算', () => {
    const result = calculateEMA([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe(1);
  });

  it('MACD应返回DIF/DEA/柱状图', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 10);
    const result = calculateMACD(prices);
    expect(result.macd.length).toBeGreaterThan(0);
    expect(result.signal.length).toBeGreaterThan(0);
    expect(result.histogram.length).toBeGreaterThan(0);
    // 生产口径：histogram = macd - signal（featureEngineeringEngine.ts:99），旧副本柱值乘 2。
    expect(result.histogram[10]).toBeCloseTo(result.macd[10] - result.signal[10], 10);
  });

  it('布林带应包含上中下轨', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 5) * 5);
    const bands = calcBollingerBands(prices, 20, 2);
    expect(bands[0].upper).toBeGreaterThan(bands[0].mid);
    expect(bands[0].mid).toBeGreaterThan(bands[0].lower);
  });

  it('数据不足布林带应返回空', () => {
    expect(calcBollingerBands([1, 2, 3], 20, 2)).toHaveLength(0);
  });

  it('随机指标应在0-100', () => {
    const highs = Array.from({ length: 20 }, (_, i) => 110 + i);
    const lows = Array.from({ length: 20 }, (_, i) => 90 + i);
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = calculateStochastic(highs, lows, closes);
    expect(result.k.every(v => v >= 0 && v <= 100)).toBe(true);
  });

  it('ATR应为正数', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 110 + i);
    const lows = Array.from({ length: n }, (_, i) => 90 + i);
    const closes = Array.from({ length: n }, (_, i) => 100 + i);
    const result = calculateATR(highs, lows, closes, 14).atr
      .filter((v): v is number => v !== null);
    expect(result.every(v => v > 0)).toBe(true);
  });

  it('数据不足ATR应返回空', () => {
    const { atr } = calculateATR([1], [0], [0.5], 14);
    expect(atr.filter((v): v is number => v !== null)).toHaveLength(0);
  });

  it('ATR 生产口径：null 预热与 trueRange', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 110 + i);
    const lows = Array.from({ length: n }, (_, i) => 90 + i);
    const closes = Array.from({ length: n }, (_, i) => 100 + i);
    const { atr, trueRange } = calculateATR(highs, lows, closes, 14);
    // atr 与输入等长，前 period 位为预热 null（backend/src/indicators/technical.ts:471、:489）。
    expect(atr).toHaveLength(n);
    expect(atr.slice(0, 14).every(v => v === null)).toBe(true);
    // trueRange[0] 恒为 null（TR 从 i=1 起算，:473-474）；本夹具每根 TR 均为 20。
    expect(trueRange[0]).toBeNull();
    expect(trueRange[1]).toBe(20);
  });

  it('OBV应正确累积', () => {
    const closes = [10, 11, 12, 11, 10];
    const volumes = [100, 200, 150, 300, 100];
    const result = calculateOBV(closes, volumes);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(300);
    expect(result[3]).toBe(150);
  });

  it('空数据OBV为生产口径（生产缺口：返回 [undefined]）', () => {
    // 生产缺口：calculateOBV 未做空输入守卫，首值取 volume[0]（featureEngineeringEngine.ts:157）。
    const result = calculateOBV([], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeUndefined();
  });

  it('大量数据技术指标应正确', () => {
    const n = 500;
    const prices = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 10) * 20);
    const rsiResult = calcRSI(prices, 14);
    expect(rsiResult.length).toBe(n - 14);
    const bb = calcBollingerBands(prices, 20, 2);
    expect(bb.length).toBe(n - 19);
  });
});

// 数据清洗引擎
describe('数据清洗引擎', () => {
  // 未迁移：生产无泛型 key 去重导出（见文件头「未迁移」节）。
  function removeDuplicates<T>(data: T[], key: keyof T): T[] {
    const seen = new Set<unknown>();
    return data.filter(item => {
      const k = item[key];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // 未迁移：rg fillMissing|impute 0 命中（见文件头「未迁移」节）。
  function fillMissingValues(data: (number | null)[], method: 'mean' | 'median' | 'zero'): number[] {
    const valid = data.filter((v): v is number => v !== null);
    if (valid.length === 0) return data.map(() => 0);
    let fillValue: number;
    if (method === 'mean') fillValue = valid.reduce((s, v) => s + v, 0) / valid.length;
    else if (method === 'median') {
      const sorted = [...valid].sort((a, b) => a - b);
      fillValue = sorted[Math.floor(sorted.length / 2)]!;
    }
    else fillValue = 0;
    return data.map(v => v ?? fillValue);
  }

  // 未迁移：生产无居中窗口平滑导出（见文件头「未迁移」节）。
  function smooth(data: number[], window: number): number[] {
    return data.map((_, i) => {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(data.length, i + Math.ceil(window / 2));
      const slice = data.slice(start, end);
      return slice.reduce((s, v) => s + v, 0) / slice.length;
    });
  }

  it('应去重', () => {
    const data = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 1, v: 'c' }];
    expect(removeDuplicates(data, 'id')).toHaveLength(2);
  });

  it('无重复应返回全部', () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(removeDuplicates(data, 'id')).toHaveLength(3);
  });

  it('应均值填充缺失值', () => {
    const data = [1, null, 3, null, 5];
    const filled = fillMissingValues(data, 'mean');
    expect(filled).toEqual([1, 3, 3, 3, 5]);
  });

  it('应中位数填充缺失值', () => {
    const data = [1, null, 100];
    const filled = fillMissingValues(data, 'median');
    expect(filled[1]).toBe(100);
  });

  it('应零值填充', () => {
    const data = [1, null, 3];
    expect(fillMissingValues(data, 'zero')).toEqual([1, 0, 3]);
  });

  it('全空应零值填充', () => {
    expect(fillMissingValues([null, null], 'mean')).toEqual([0, 0]);
  });

  it('应归一化到0-1', () => {
    const data = [10, 20, 30, 40, 50];
    const normed = minMaxNormalize(data);
    expect(normed[0]).toBe(0);
    expect(normed[4]).toBe(1);
  });

  it('恒定数据归一化应为0', () => {
    // 生产 minMaxNormalize 在 range===0 时全 0（dataFlowEngine.ts:225）。
    expect(minMaxNormalize([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('Z-Score均值应接近0', () => {
    const data = [1, 2, 3, 4, 5];
    const scores = zScoreSeries(data);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    expect(Math.abs(mean)).toBeLessThan(0.001);
    // 生产每项 4 位舍入（zScoreEngine.ts:15）。
    expect(scores[0]).toBe(-1.4142);
    expect(scores[4]).toBe(1.4142);
  });

  it('恒定数据Z-Score应为0', () => {
    expect(zScoreSeries([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('应平滑数据', () => {
    const data = [1, 100, 1, 100, 1];
    const smoothed = smooth(data, 3);
    expect(smoothed[1]).toBeLessThan(100);
    expect(smoothed[1]).toBeGreaterThan(1);
  });

  it('大量数据去重应正确', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ id: i % 100, v: i }));
    expect(removeDuplicates(data, 'id')).toHaveLength(100);
  });
});

// 时间序列分析
describe('时间序列分析引擎', () => {
  interface TimePoint { timestamp: number; value: number }

  // 未迁移：rg linearInterpolate 仅命中测试（见文件头「未迁移」节）。
  function linearInterpolate(series: TimePoint[], targetTime: number): number {
    if (series.length === 0) return 0;
    const sorted = [...series].sort((a, b) => a.timestamp - b.timestamp);
    if (targetTime <= sorted[0]!.timestamp) return sorted[0]!.value;
    if (targetTime >= sorted[sorted.length - 1]!.timestamp) return sorted[sorted.length - 1]!.value;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (targetTime >= sorted[i]!.timestamp && targetTime <= sorted[i + 1]!.timestamp) {
        const ratio = (targetTime - sorted[i]!.timestamp) / (sorted[i + 1]!.timestamp - sorted[i]!.timestamp);
        return sorted[i]!.value + ratio * (sorted[i + 1]!.value - sorted[i]!.value);
      }
    }
    return 0;
  }

  // 未迁移：生产 calculateMA 为 number[] → number[]（见文件头「未迁移」节）。
  function movingAverage(series: TimePoint[], period: number): TimePoint[] {
    const result: TimePoint[] = [];
    for (let i = period - 1; i < series.length; i++) {
      const slice = series.slice(i - period + 1, i + 1);
      const avg = slice.reduce((s, p) => s + p.value, 0) / period;
      result.push({ timestamp: series[i]!.timestamp, value: avg });
    }
    return result;
  }

  // 未迁移：rg exponentialSmoothing 无导出（见文件头「未迁移」节）。
  function exponentialSmoothing(series: TimePoint[], alpha: number): TimePoint[] {
    if (series.length === 0) return [];
    const result: TimePoint[] = [{ timestamp: series[0]!.timestamp, value: series[0]!.value }];
    for (let i = 1; i < series.length; i++) {
      result.push({
        timestamp: series[i]!.timestamp,
        value: alpha * series[i]!.value + (1 - alpha) * result[i - 1]!.value,
      });
    }
    return result;
  }

  it('应线性插值', () => {
    const series: TimePoint[] = [
      { timestamp: 0, value: 0 },
      { timestamp: 10, value: 100 },
    ];
    expect(linearInterpolate(series, 5)).toBe(50);
  });

  it('超出范围应返回边界值', () => {
    const series: TimePoint[] = [{ timestamp: 5, value: 50 }, { timestamp: 10, value: 100 }];
    expect(linearInterpolate(series, 0)).toBe(50);
    expect(linearInterpolate(series, 15)).toBe(100);
  });

  it('空序列插值应为0', () => {
    expect(linearInterpolate([], 5)).toBe(0);
  });

  it('应计算移动平均', () => {
    const series: TimePoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: i + 1 }));
    const ma = movingAverage(series, 3);
    expect(ma).toHaveLength(8);
    expect(ma[0]!.value).toBe(2);
  });

  it('应指数平滑', () => {
    const series: TimePoint[] = [{ timestamp: 0, value: 100 }, { timestamp: 1, value: 110 }];
    const smoothed = exponentialSmoothing(series, 0.5);
    expect(smoothed[1]!.value).toBe(105);
  });

  it('空序列平滑应返回空', () => {
    expect(exponentialSmoothing([], 0.5)).toHaveLength(0);
  });

  it('应检测上升趋势', () => {
    const series: TimePoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 100 + i * 10 }));
    // 生产默认 window=20，n<20 直接中性（regimeDetectionEngine.ts:55-57）；10 点夹具显式传 window=10。
    expect(detectTrend(series.map(p => p.value), 10).direction).toBe('up');
  });

  it('应检测下降趋势', () => {
    const series: TimePoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 200 - i * 10 }));
    expect(detectTrend(series.map(p => p.value), 10).direction).toBe('down');
  });

  it('单点趋势应为neutral', () => {
    expect(detectTrend([100], 10).direction).toBe('neutral');
  });

  it('短序列趋势检测返回neutral（生产契约）', () => {
    // n < window（默认 20）时直接返回 neutral，不做斜率判断（regimeDetectionEngine.ts:54-57）。
    expect(detectTrend([1, 2, 3, 4, 5]).direction).toBe('neutral');
  });

  it('大量数据移动平均应正确', () => {
    const series: TimePoint[] = Array.from({ length: 1000 }, (_, i) => ({ timestamp: i, value: 100 }));
    const ma = movingAverage(series, 20);
    expect(ma.every(p => p.value === 100)).toBe(true);
    expect(ma).toHaveLength(981);
  });

  it('精确匹配插值应返回原值', () => {
    const series: TimePoint[] = [{ timestamp: 5, value: 42 }, { timestamp: 10, value: 84 }];
    expect(linearInterpolate(series, 5)).toBe(42);
    expect(linearInterpolate(series, 10)).toBe(84);
  });
});
