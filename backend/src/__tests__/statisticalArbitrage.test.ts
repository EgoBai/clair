import { describe, it, expect } from 'vitest';
import { calculateCorrelation } from '../../../frontend/src/utils/correlationMatrix';
import {
  testCointegration,
  generatePairsSignals,
  calculateOptimalHedgeRatio,
} from '../../../frontend/src/utils/pairsTradingEngine';
import type {
  CointegrationResult,
  PriceSeries,
} from '../../../frontend/src/utils/pairsTradingEngine';

/**
 * 统计套利测试（影子测试迁移 · 批次 27b）
 *
 * 生产真源（本文件不再自抄实现）：
 *   frontend/src/utils/correlationMatrix.ts
 *     → calculateCorrelation(L78-84)：样本协方差 /（样本标准差 × 样本标准差），clamp 到 [-1,1]；
 *       calculateCovariance(L66-76) 用 min 长度、除以 n-1；calculateStdDev(L59-64) 用**全长**入参、
 *       n<2→0。故本文件只使用等长夹具，避免 std 全长与 cov 短取的口径错位。
 *   frontend/src/utils/pairsTradingEngine.ts
 *     → testCointegration(L48-105)：len<10 短路（L53-58）；OLS 对冲比率（L64-72，分母为 0 时取 1）；
 *       spread=y-βx（L75）；rho 用**未去均值**的 lag-1 回归（L80-85）；
 *       adfStatistic=rho*√len（L86）；pValue=max(0.001,min(1,0.5-|adf|*0.1))（L87）；
 *       isCointegrated=pValue<0.05（L88）；halfLife=rho<0?round(-ln2/rho*100)/100:0，clamp[0,365]（L91,L99）。
 *     → generatePairsSignals(L110-173)：返回 PairsSignal 事件数组（入场/离场），不是旧版计数对象。
 *     → calculateOptimalHedgeRatio(L249-297)：OLS 时返回长度 min 的常数数组，len<2 → []。
 *   同目录 pairsTradingEngine2.ts 的 testCointegration(L49-116) 契约不同（n<20、spread 再减 α、
 *   样本标准差、ADF t 统计），且页面/后端均未引用；本批按 docs/harness/SHADOW-TEST-CENSUS.md:262
 *   以 pairsTradingEngine.ts 为准，不采用 engine2。
 *
 * 旧断言修正（旧行号=迁移前文件）：
 *   1) calcHedgeRatio 数据不足：旧 L20-31 返回 1；生产 calculateOptimalHedgeRatio(L256) 返回 []，
 *      testCointegration(L53-58) 的 hedgeRatio 为 0 —— 改为断言生产的两处口径。
 *   2) calcHalfLife([1,2])：旧 L39 返回 1；生产 len<10 直接给 halfLife 0。
 *   3) calcHalfLife(stockA-stockB)：旧 L157-161 断言 >0 且有限。但 stockB 恰为 0.5×stockA（完全成
 *      比例），生产 OLS spread 全 0 → rho=0 → halfLife 0。旧断言建立在 0.5×stockA 的趋势序列上，
 *      是影子逻辑的产物，按生产改为 0。
 *   4) calcCorrelation：旧 L5-18 用总体矩（除以 n）；生产用样本矩（n-1），等长输入下比值相同，
 *      改为精确值 1 / -1 断言（旧只到 5 位小数）。
 *   5) generatePairsSignals：旧 L54-66 返回 {long,short,exits} 计数；生产返回事件数组，改按
 *      time/signal/zScore/spreadValue/expectedReturn/confidence 逐字段断言。
 *   6) testCointegration：旧 L68-82 返回 {adfStat,isCointegrated}，n<3 守卫、beta 阈值 -0.3；
 *      生产返回完整 CointegrationResult，n<10 守卫，isCointegrated=pValue<0.05（需 |rho| 略大于 1）。
 *   7) stockA/stockB 旧断言只剩「>0 / finite」；生产可给精确值（相关系数 1、对冲比率 0.5、spread 0）。
 *
 * 未迁移：无。旧 6 个 helper 均有生产对应实现（spread/hedgeRatio/halfLife 通过 testCointegration
 * 返回值绑定），旧 helper 已整体删除。
 */

const stockA = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 110, 108, 106, 107, 109, 111, 113, 112, 114, 116];
// 恰好是 0.5 × stockA：用于验证「完全成比例」时的 spread=0、相关系数=1、对冲比率=0.5
const stockB = [50, 51, 50.5, 51.5, 52.5, 52, 53, 54, 53.5, 54.5, 55, 54, 53, 53.5, 54.5, 55.5, 56.5, 56, 57, 58];

const makeSeries = (symbol: string, prices: number[]): PriceSeries => ({
  symbol,
  prices,
  timestamps: prices.map((_, i) => `${symbol}_${i}`),
});

// 10 个等距点：mean(x)=-0.5，Σ(x-mean)^2=85，Σ(x-mean)(2x-2mean)=170 → 对冲比率精确为 2
const xLinear = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4];
const yLinear = xLinear.map((v) => 2 * v);

// x 恒为 1 → OLS 分母为 0，生产取 hedgeRatio=1；y 交替 2/0 → spread 交替 +1/-1
const xFlat = Array(20).fill(1);
const yAlternating = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 2 : 0));

const makeCointegration = (
  spread: number[],
  spreadMean: number,
  spreadStd: number,
): CointegrationResult => ({
  symbol1: 'A',
  symbol2: 'B',
  adfStatistic: 0,
  pValue: 0.5,
  isCointegrated: false,
  halfLife: 0,
  hedgeRatio: 1,
  spread,
  spreadMean,
  spreadStd,
});

describe('统计套利', () => {
  describe('相关性计算（correlationMatrix.calculateCorrelation）', () => {
    it('完全正相关应该为1', () => {
      expect(calculateCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 12);
    });

    it('完全负相关应该为-1', () => {
      expect(calculateCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1, 12);
    });

    it('同向变动的股票应该正相关', () => {
      // stockB = 0.5 × stockA，相关系数精确为 1（旧断言只需 >0.5，过弱）
      expect(calculateCorrelation(stockA, stockB)).toBeCloseTo(1, 12);
    });

    it('空数据应该返回0', () => {
      expect(calculateCorrelation([], [])).toBe(0);
    });

    it('常数序列应该返回0', () => {
      expect(calculateCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
    });
  });

  describe('对冲比率（testCointegration / calculateOptimalHedgeRatio）', () => {
    it('线性关系应该正确计算', () => {
      expect(calculateOptimalHedgeRatio([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toEqual([2, 2, 2, 2, 2]);

      const result = testCointegration(makeSeries('X', xLinear), makeSeries('Y', yLinear));
      expect(result.hedgeRatio).toBe(2);
      expect(result.spreadStd).toBe(0);
    });

    it('数据不足应该返回空对冲比率（生产口径）', () => {
      // 旧 helper 约定返回 1；生产 calculateOptimalHedgeRatio 返回 []（L256），
      // testCointegration 在 len<10 时返回 hedgeRatio=0、spread=[]（L53-58）
      expect(calculateOptimalHedgeRatio([1], [2])).toEqual([]);

      const result = testCointegration(makeSeries('A', [1]), makeSeries('B', [2]));
      expect(result.hedgeRatio).toBe(0);
      expect(result.spread).toEqual([]);
      expect(result.pValue).toBe(1);
    });

    it('正相关股票的对冲比率应该精确为0.5', () => {
      // 两条生产路径必须给出同一个 OLS 比率（防止参数顺序颠倒仍「>0 蒙混」）
      expect(testCointegration(makeSeries('A', stockA), makeSeries('B', stockB)).hedgeRatio).toBe(0.5);
      expect(calculateOptimalHedgeRatio(stockA, stockB)[0]).toBe(0.5);
    });
  });

  describe('价差计算（testCointegration().spread）', () => {
    it('线性关系 spread 应该全为 0', () => {
      const result = testCointegration(makeSeries('X', xLinear), makeSeries('Y', yLinear));
      expect(result.spread).toEqual(Array(10).fill(0));
      expect(result.spreadMean).toBe(0);
      expect(result.spreadStd).toBe(0);
    });

    it('长度应该等于输入最小长度', () => {
      const result = testCointegration(makeSeries('A', stockA), makeSeries('B', stockB.slice(0, 10)));
      expect(result.spread).toHaveLength(10);
      expect(result.spread).toHaveLength(Math.min(stockA.length, 10));
    });

    it('零对冲比率时 spread 应该等于 Y', () => {
      // y 恒为 5、x 有方差：协方差为 0 → hedgeRatio=0 → spread 逐点等于 y
      const result = testCointegration(makeSeries('X', xLinear), makeSeries('Y', Array(10).fill(5)));
      expect(result.hedgeRatio).toBe(0);
      expect(result.spread).toEqual(Array(10).fill(5));
      expect(result.spreadMean).toBe(5);
    });
  });

  describe('半衰期（testCointegration().halfLife）', () => {
    it('强交替价差应该有短半衰期', () => {
      const result = testCointegration(makeSeries('X', xFlat), makeSeries('Y', yAlternating));

      // spread 交替 +1/-1 → rho=-2 → adf=-2*√20=-8.944 → pValue 触底 0.001 → 判定协整
      expect(result.hedgeRatio).toBe(1);
      expect(result.spreadStd).toBe(1);
      expect(result.adfStatistic).toBe(-8.944);
      expect(result.pValue).toBe(0.001);
      expect(result.isCointegrated).toBe(true);
      // halfLife = round(-ln2 / -2 * 100) / 100
      expect(result.halfLife).toBe(0.35);
    });

    it('数据不足应该返回 0（旧为 1）', () => {
      expect(testCointegration(makeSeries('A', [1]), makeSeries('B', [2])).halfLife).toBe(0);
    });

    it('完全成比例的价差（spread=0）半衰期为 0', () => {
      // stockB=0.5×stockA → spread 恒为 0 → rho=0，生产 halfLife=0；
      // 旧断言用 0.5×stockA 的趋势序列（非真实 spread）得到 >0，属影子逻辑，已订正
      const result = testCointegration(makeSeries('A', stockA), makeSeries('B', stockB));
      expect(result.spreadStd).toBe(0);
      expect(result.halfLife).toBe(0);
      expect(result.isCointegrated).toBe(false);
    });
  });

  describe('配对交易信号（generatePairsSignals）', () => {
    const timestamps = Array.from({ length: 9 }, (_, i) => `t${i}`);

    it('价差过高应该产生 short_spread 并在回归后 exit', () => {
      const signals = generatePairsSignals(
        makeCointegration([0, 0, 0, 3, 3, 3, 0, 0, 0], 0, 1),
        timestamps,
      );

      expect(signals).toHaveLength(2);
      expect(signals[0]).toEqual({
        time: 't3',
        signal: 'short_spread',
        zScore: 3,
        spreadValue: 3,
        // 生产口径：expectedReturn=(mean-spread)/std，空头入场为负（既有实现，仅记录不修）
        expectedReturn: -3,
        confidence: 1,
      });
      expect(signals[1]).toEqual({
        time: 't6',
        signal: 'exit',
        zScore: 0,
        spreadValue: 0,
        expectedReturn: 0,
        confidence: 0.8,
      });
    });

    it('价差过低应该产生 long_spread 并在回归后 exit', () => {
      const signals = generatePairsSignals(
        makeCointegration([-3, -3, -3, 0, 0, 0], 0, 1),
        Array.from({ length: 6 }, (_, i) => `t${i}`),
      );

      expect(signals).toHaveLength(2);
      expect(signals[0].signal).toBe('long_spread');
      expect(signals[0].time).toBe('t0');
      expect(signals[0].expectedReturn).toBe(3);
      expect(signals[0].confidence).toBe(1);
      expect(signals[1].signal).toBe('exit');
      expect(signals[1].time).toBe('t3');
    });

    it('常数spread不应该产生信号', () => {
      expect(generatePairsSignals(makeCointegration([5, 5, 5], 5, 0), ['t0', 't1', 't2'])).toEqual([]);
    });

    it('未达入场阈值不建仓、exitThreshold 生效、缺省时间戳用 day_i', () => {
      // |z|=1.5 < 默认入场阈值 2 → 无信号
      expect(generatePairsSignals(makeCointegration([0, 0, 0, 1.5, 1.5, 1.5], 0, 1), []))
        .toEqual([]);

      // z=1.0 未触发离场阈值 0.5；z=0.4 才离场
      const exitSignals = generatePairsSignals(
        makeCointegration([3, 1, 0.4, 0.4], 0, 1),
        ['t0', 't1', 't2', 't3'],
      );
      expect(exitSignals.map((s) => s.signal)).toEqual(['short_spread', 'exit']);
      expect(exitSignals[1].time).toBe('t2');
      expect(exitSignals[1].zScore).toBe(0.4);

      // 不传时间戳时回退为 day_<index>（L129/L159）
      const fallback = generatePairsSignals(makeCointegration([0, 0, 0, 3, 3, 3, 0, 0, 0], 0, 1), []);
      expect(fallback.map((s) => s.time)).toEqual(['day_3', 'day_6']);
    });
  });

  describe('协整检验（testCointegration）', () => {
    it('应该返回完整契约字段', () => {
      const result = testCointegration(makeSeries('A', stockA), makeSeries('A', stockA));
      expect(Object.keys(result).sort()).toEqual([
        'adfStatistic',
        'halfLife',
        'hedgeRatio',
        'isCointegrated',
        'pValue',
        'spread',
        'spreadMean',
        'spreadStd',
        'symbol1',
        'symbol2',
      ]);
      expect(typeof result.adfStatistic).toBe('number');
      expect(typeof result.isCointegrated).toBe('boolean');
      expect(result.symbol1).toBe('A');
      expect(result.symbol2).toBe('A');
    });

    it('相同序列的统计量应该为近零', () => {
      const result = testCointegration(makeSeries('A', stockA), makeSeries('A', stockA));
      expect(result.adfStatistic).toBe(0);
      expect(result.pValue).toBe(0.5);
      expect(result.isCointegrated).toBe(false);
      expect(result.halfLife).toBe(0);
      expect(result.hedgeRatio).toBe(1);
      expect(result.spreadMean).toBe(0);
      expect(result.spreadStd).toBe(0);
      expect(result.spread).toHaveLength(stockA.length);
    });

    it('数据不足不应该崩溃且返回默认值（旧守卫 n<3 → 生产 n<10）', () => {
      const result = testCointegration(makeSeries('A', [1]), makeSeries('B', [2]));
      expect(result.isCointegrated).toBe(false);
      expect(result.adfStatistic).toBe(0);
      expect(result.pValue).toBe(1);
      expect(result.halfLife).toBe(0);
      expect(result.hedgeRatio).toBe(0);
      expect(result.spreadMean).toBe(0);
      expect(result.spreadStd).toBe(0);
      expect(result.spread).toEqual([]);

      // 9 个点仍未达生产门槛（len<10）
      const ninePoints = testCointegration(makeSeries('A', Array(9).fill(1)), makeSeries('B', Array(9).fill(2)));
      expect(ninePoints.spread).toEqual([]);
      expect(ninePoints.pValue).toBe(1);
    });
  });
});
