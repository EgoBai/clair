/**
 * 影子测试迁移：technicalAnalysis.test.ts
 *
 * 一、原自抄实现的问题
 * 1. 11 组指标算法全部在测试文件内重写（calcEMA/calcRSI/calcKDJ/calcBOLL/calcATR/findPivots/
 *    fibLevels/detectTrend/detectBullishDivergence/detectBearishDivergence/detectCross），
 *    测试验证的是副本而不是生产：生产实现改了，本文件仍然全绿。
 * 2. 副本用 NaN 预热、紧凑数组返回，掩盖了生产实现的 null 预热与索引语义：
 *    - MACD 的 DEA 需要 signalPeriod 个有效 MACD 值才出现（30 根 K 线时 signal/histogram 仍为 null）；
 *    - KDJ 首有效 bar 强制 K=D=50（不是按首根 RSV 更新），数组与输入等长、前 period-1 为 null；
 *    - ATR 的 trueRange[0] 为 null（TR 从第 2 根 K 线开始），ATR 从 index=period 起才有值；
 *    - RSI/KDJ/BOLL 均为等长数组 + null 预热，而不是紧凑数组。
 * 3. 多处恒真断言：
 *    - MACD 金叉/死叉用字面数组自证；
 *    - RSI overbought/oversold 直接 const rsi = 75 / 25；
 *    - KDJ overbought/oversold 直接 const k = 85, d = 82 / k = 15, d = 18；
 *    - MA period=1 用例只是 prices.map(p => p)；
 *    - BOLL/KDJ 的 forEach 只断言副本自己返回的数字。
 * 4. 随机与零断言守卫：RSI period=14、ATR 波动用例使用 Math.random；支撑压力第二例用
 *    if (resistances.length && supports.length) 包裹唯一断言，条件不成立时零断言。
 * 5. 口径错误：detectTrend 副本按"最近 period 首尾涨跌幅 ±2%"返回 'up'|'down'|'sideways'；
 *    生产 frontend/src/utils/regimeDetectionEngine.ts:53 用最近 window 的线性回归斜率
 *    （> +0.01 up / < -0.01 down / 其余 neutral），返回 TrendAnalysis 对象。
 * 6. 结构错误：divergence 副本只看最后两根 K 线的价格/指标方向；
 *    生产 momentumDivergenceEngine.ts:164 用 findPivots 的枢轴成对比较 + lookback 窗口。
 *    cross 副本返回 'golden'|'death'|null；生产 frontend/src/utils/trendFollowingEngine.ts:113
 *    返回 TrendSignal[]（type/ma/price/maValue/strength/direction/description）。
 *
 * 二、绑定到哪份生产实现及 file:line
 * - calcMA / calcEMA → backend/src/utils/futureValueUtils.ts:39 / :89
 *   （null 预热、全精度；与自抄副本数值口径一致。technical.ts:120/139 同名实现每步 toFixed(4)，
 *    仅用于本文件 MACD 块的 DIF 恒等式复核，见下）
 * - calculateEMA → backend/src/indicators/technical.ts:139（仅 MACD 块复核 DIF = EMA12 - EMA26）
 * - calculateMACD → backend/src/indicators/technical.ts:168
 *   histogram = macd - signal（未乘 2）。未采用 futureValueUtils.ts:109：其 histogram = 2*(dif-dea)，
 *   与旧断言 dif-dea 口径不同；旧副本也未实现 DEA，故旧 histogram 断言无生产依据。
 * - calculateRSI → backend/src/indicators/technical.ts:233
 *   （Wilder 平滑、等长 null 预热、index=period 首值。未采用 chartDataEngine.ts:36：
 *    它是紧凑数组变体，索引语义不同）
 * - calculateKDJ → backend/src/indicators/technical.ts:289（首有效 bar K=D=50）
 * - calculateBollingerBands → backend/src/indicators/technical.ts:356（middle 来自 calculateMA）
 * - calculateATR → backend/src/indicators/technical.ts:461（返回 {atr,trueRange}）
 * - findPivots → backend/src/services/momentumDivergenceEngine.ts:139（返回索引，测试内 map 回价格）
 * - detectDivergences → backend/src/services/momentumDivergenceEngine.ts:164（枢轴配对）
 * - detectTrend → frontend/src/utils/regimeDetectionEngine.ts:53（取 .direction）
 * - detectCrossovers → frontend/src/utils/trendFollowingEngine.ts:113（TrendSignal[]）
 * - calculateFibonacciLevels → frontend/src/utils/elliottWaveEngine.ts:307（retracement 键 0.0..1.0）
 * 跨包依赖核查（D43）：上述 frontend 三个模块顶部均无任何 import，不含 xlsx/file-saver 等
 * 浏览器端依赖；backend 侧所选模块同样零 import，CI 只装 backend 依赖也能解析。
 *
 * 三、未迁移清单及原因
 * 无。11 组全部绑定到生产实现；仅保留三处非算法适配，不复制任何指标公式：
 * 1. findPivots 返回索引 → 映射为价格值；
 * 2. Fibonacci retracement 键 → level0..level100 键名适配；
 * 3. detectCrossovers 的 MAValues 行构造（未用均线填 NaN，使其余 4 组均线对自动跳过）。
 * 原文件中的 calcEMA/calcRSI/calcKDJ/calcBOLL/calcATR/findPivots/fibLevels/detectTrend/
 * detectBullishDivergence/detectBearishDivergence/detectCross 副本全部删除。
 */
import { describe, it, expect } from 'vitest';

import { calcMA, calcEMA } from '../utils/futureValueUtils';
import {
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateKDJ,
  calculateBollingerBands,
  calculateATR,
} from '../indicators/technical';
import { findPivots, detectDivergences } from '../services/momentumDivergenceEngine';
import { detectTrend } from '../../../frontend/src/utils/regimeDetectionEngine';
import { detectCrossovers } from '../../../frontend/src/utils/trendFollowingEngine';
import { calculateFibonacciLevels } from '../../../frontend/src/utils/elliottWaveEngine';

const round4 = (value: number): number => parseFloat(value.toFixed(4));

type MaRow = {
  date: string;
  close: number;
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  ma120: number;
  ma250: number;
};

function maRow(index: number, close: number, ma5: number, ma10: number): MaRow {
  return {
    date: `2025-01-${String(index + 1).padStart(2, '0')}`,
    close,
    ma5,
    ma10,
    ma20: NaN,
    ma60: NaN,
    ma120: NaN,
    ma250: NaN,
  };
}

// 非算法适配：只做键名映射，斐波那契数值仍由生产 calculateFibonacciLevels 计算。
function fibLevels(high: number, low: number) {
  const { retracement } = calculateFibonacciLevels(high, low);
  return {
    level0: retracement[0],
    level236: retracement[0.236],
    level382: retracement[0.382],
    level500: retracement[0.5],
    level618: retracement[0.618],
    level786: retracement[0.786],
    level100: retracement[1],
  };
}

// Technical analysis and indicator calculation tests
describe('Technical Analysis Engine', () => {
  // Moving Average calculations
  describe('Moving Averages', () => {
    const prices = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];

    it('should calculate SMA correctly', () => {
      // 旧断言用 reduce 自算、只校验 14；现绑定 calcMA（futureValueUtils.ts:39）。
      const ma = calcMA(prices, 5);
      expect(ma.slice(0, 4)).toEqual([null, null, null, null]);
      expect(ma[4]).toBe(14);
    });

    it('should calculate SMA for last period', () => {
      const ma = calcMA(prices, 5);
      expect(ma[8]).toBe(22);
      expect(ma[9]).toBe(24);
    });

    it('should calculate EMA with smoothing factor', () => {
      // 旧断言用自抄 EMA 且只断 >= 24；生产 calcEMA 用 SMA 播种，末值精确为 24。
      const ema = calcEMA(prices, 5);
      expect(ema.slice(0, 4)).toEqual([null, null, null, null]);
      expect(ema[4]).toBe(14);
      expect(ema[9]).toBe(24);
    });

    it('should handle period = 1 (equals original)', () => {
      // 旧断言只是 prices.map(p => p)（恒真）；改为校验 period=1 时两条生产 MA 原样返回。
      expect(calcMA(prices, 1)).toEqual(prices);
      expect(calcEMA(prices, 1)).toEqual(prices);
    });

    it('should return null for insufficient data', () => {
      // 旧断言用三元表达式自证 null；改为校验生产实现的 null 预热数组。
      expect(calcMA([1, 2, 3], 5)).toEqual([null, null, null]);
      expect(calcEMA([1, 2, 3], 5)).toEqual([null, null, null]);
    });

    it('should calculate multiple MAs consistently', () => {
      const ma5 = calcMA(prices, 5);
      const ma10 = calcMA(prices, 10);
      expect(ma5[9]).toBe(24);
      expect(ma10[9]).toBe(19);
      expect(ma5[9]!).toBeGreaterThan(ma10[9]!);
    });
  });

  // MACD calculations
  describe('MACD Indicator', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 2);

    it('should calculate DIF = EMA12 - EMA26', () => {
      // 旧断言用自抄 calcEMA（NaN 预热）只断 finite；生产 MACD 的 macd[i] 就是
      // round4(EMA12[i] - EMA26[i])，这里同时校验恒等式与确定值。
      const { macd } = calculateMACD(prices);
      const ema12 = calculateEMA(prices, 12);
      const ema26 = calculateEMA(prices, 26);
      const last = prices.length - 1;
      expect(macd[last]).not.toBeNull();
      expect(macd[last]).toBe(round4(ema12[last]! - ema26[last]!));
      expect(macd[last]).toBe(3.4332);
    });

    it('should have DIF positive in uptrend', () => {
      const upPrices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      const { macd } = calculateMACD(upPrices);
      expect(macd[29]).toBe(14);
      expect(macd[29]!).toBeGreaterThan(0);
    });

    it('should have DIF negative in downtrend', () => {
      const downPrices = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
      const { macd } = calculateMACD(downPrices);
      expect(macd[29]).toBe(-14);
      expect(macd[29]!).toBeLessThan(0);
    });

    it('should detect golden cross (DIF > DEA)', () => {
      // 旧断言用字面数组 dif/dea 自证；改为构造 40 根确定 K 线，让生产 MACD 的
      // histogram 在最后一根由 <= 0 翻到 > 0（DIF 上穿 DEA）。
      const crossPrices = [
        ...Array.from({ length: 24 }, () => 100),
        99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89,
        90, 91, 92, 93, 94,
      ];
      const { macd, signal, histogram } = calculateMACD(crossPrices);
      const last = crossPrices.length - 1;
      expect(macd[last - 1]!).toBeLessThanOrEqual(signal[last - 1]!);
      expect(macd[last]!).toBeGreaterThan(signal[last]!);
      expect(histogram[last - 1]!).toBeLessThanOrEqual(0);
      expect(histogram[last]!).toBeGreaterThan(0);
      expect(macd[last]).toBe(-2.0089);
      expect(signal[last]).toBe(-2.0711);
      expect(histogram[last]).toBe(0.0622);
    });

    it('should detect death cross (DIF < DEA)', () => {
      // 旧断言 dif[4] < dea[3] 是拿不同下标的字面量比较；改为生产 MACD 的下穿。
      const crossPrices = [
        ...Array.from({ length: 24 }, () => 100),
        101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
        110, 109, 108, 107, 106,
      ];
      const { macd, signal, histogram } = calculateMACD(crossPrices);
      const last = crossPrices.length - 1;
      expect(macd[last - 1]!).toBeGreaterThanOrEqual(signal[last - 1]!);
      expect(macd[last]!).toBeLessThan(signal[last]!);
      expect(histogram[last - 1]!).toBeGreaterThanOrEqual(0);
      expect(histogram[last]!).toBeLessThan(0);
      expect(macd[last]).toBe(2.0089);
      expect(signal[last]).toBe(2.0711);
      expect(histogram[last]).toBe(-0.0622);
    });

    it('should calculate histogram = DIF - DEA', () => {
      // 旧断言用 5.2/4.8 两个字面量算 0.4，从未经过生产实现；改为 60 根 K 线上
      // 校验生产 histogram 与 macd-signal 的恒等式及确定值。
      const longPrices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 2);
      const { macd, signal, histogram } = calculateMACD(longPrices);
      const last = longPrices.length - 1;
      expect(histogram[last]).not.toBeNull();
      expect(histogram[last]).toBe(round4(macd[last]! - signal[last]!));
      expect(histogram[last]).toBe(0.1611);
    });

    it('should leave DEA and histogram null before enough MACD values (30 bars)', () => {
      // 新增用例（旧文件 7 个 MACD 用例未覆盖 DEA 预热）：30 根 K 线只有 5 个有效 MACD 值，
      // 不足 signalPeriod=9，故最后一根 signal/histogram 仍为 null。
      const { macd, signal, histogram } = calculateMACD(prices);
      expect(macd[29]).not.toBeNull();
      expect(signal[29]).toBeNull();
      expect(histogram[29]).toBeNull();
    });

    it('should handle flat market (DIF ≈ 0)', () => {
      const flatPrices = Array.from({ length: 30 }, () => 100);
      const { macd, signal } = calculateMACD(flatPrices);
      expect(macd[29]).toBe(0);
      expect(signal[29]).toBeNull();
    });
  });

  // RSI calculations
  describe('RSI Indicator', () => {
    it('should return 100 when all gains', () => {
      // 旧断言用自抄标量 calcRSI；生产 calculateRSI 返回等长数组，首个值在 index=period。
      const rsi = calculateRSI([10, 11, 12, 13, 14, 15], 5);
      expect(rsi.slice(0, 5)).toEqual([null, null, null, null, null]);
      expect(rsi[5]).toBe(100);
    });

    it('should return 0 when all losses', () => {
      const rsi = calculateRSI([15, 14, 13, 12, 11, 10], 5);
      expect(rsi[5]).toBe(0);
      expect(rsi[5]!).toBeLessThan(30);
    });

    it('should return 100 for flat prices (no losses)', () => {
      // 旧用例标题写 "50"、断言却是 100（avgLoss=0 时生产固定返回 100），标题一并订正。
      const rsi = calculateRSI([10, 10, 10, 10, 10, 10], 5);
      expect(rsi.slice(0, 5)).toEqual([null, null, null, null, null]);
      expect(rsi[5]).toBe(100);
    });

    it('should be between 0 and 100', () => {
      // 旧断言只断范围；改为同时校验生产首值的确定结果。
      const rsi = calculateRSI([10, 12, 11, 13, 9, 14, 8, 15], 5);
      expect(rsi[5]).toBe(64.2857);
      expect(rsi[5]!).toBeGreaterThanOrEqual(0);
      expect(rsi[5]!).toBeLessThanOrEqual(100);
    });

    it('should detect overbought (RSI > 70)', () => {
      // 旧断言 const rsi = 75 恒真；改为 14 涨 1 跌 0.5 的确定序列（生产 RSI=96.2963）。
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 112.5];
      const rsi = calculateRSI(prices, 14);
      expect(rsi[14]).toBe(96.2963);
      expect(rsi[14]!).toBeGreaterThan(70);
    });

    it('should detect oversold (RSI < 30)', () => {
      // 旧断言 const rsi = 25 恒真；改为镜像确定序列（生产 RSI=3.7037）。
      const prices = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 87.5];
      const rsi = calculateRSI(prices, 14);
      expect(rsi[14]).toBe(3.7037);
      expect(rsi[14]!).toBeLessThan(30);
    });

    it('should handle period = 14 (standard)', () => {
      // 旧用例用 Math.random 且只断 finite；改为确定夹具并校验生产末值。
      const prices = [100, 101, 102, 101, 103, 104, 103, 105, 106, 105, 107, 108, 107, 109, 110, 109, 111, 112, 111, 113];
      const rsi = calculateRSI(prices, 14);
      expect(rsi[19]).toBe(76.1154);
      expect(rsi[19]).not.toBeNull();
    });
  });

  // KDJ calculations
  describe('KDJ Indicator', () => {
    it('should calculate KDJ with correct structure', () => {
      // 旧断言对紧凑数组只断 length>0 + finite；生产返回等长数组、前 period-1 为 null，
      // 且首有效 bar（i=period-1）强制 K=D=50，旧副本首值 63.8889/54.6296 是错的。
      const highs = [10, 12, 14, 16, 18, 20];
      const lows = [8, 10, 12, 14, 16, 18];
      const closes = [9, 11, 13, 15, 17, 19];
      const { k, d, j } = calculateKDJ(highs, lows, closes, 5);
      // 生产首有效 bar 是 i=period-1=4：RSV=(17-8)/(18-8)*100=90，但 K=D 强制 50；
      // 窗口取 highData[i-period+1..i]，i=5 的 RSV=(19-10)/(20-10)*100=90，
      // 故 K=(2/3)*50+(1/3)*90=63.3333、D=54.4444、J=81.1111。
      // 旧副本返回紧凑数组、6 根时只有 1 个值，且首值按 RSV 更新（63.8889/54.6296），是错的。
      expect(k).toHaveLength(6);
      expect(k.slice(0, 4)).toEqual([null, null, null, null]);
      expect(k[4]).toBe(50);
      expect(k[5]).toBe(63.3333);
      expect(d[4]).toBe(50);
      expect(d[5]).toBe(54.4444);
      expect(j[4]).toBe(50);
      expect(j[5]).toBe(81.1111);
    });

    it('should have J = 3K - 2D', () => {
      // 旧断言在紧凑数组上逐项 closeTo；改为 8 根 period=3 的确定夹具，先断生产确定的
      // K/D/J 数组，再逐项校验 J 与 3K-2D 的关系（生产 J 用未舍入的 K/D 计算，容差 3 位）。
      const highs = [10, 11, 12, 13, 12, 14, 15, 16];
      const lows = [8, 9, 10, 11, 10, 12, 13, 14];
      const closes = [9, 10, 11, 12, 11, 13, 14, 15];
      const { k, d, j } = calculateKDJ(highs, lows, closes, 3);
      expect(k.slice(2)).toEqual([50, 58.3333, 50, 58.3333, 65.5555, 68.7037]);
      expect(d.slice(2)).toEqual([50, 52.7778, 51.8519, 54.0124, 57.8601, 61.4746]);
      expect(j.slice(2)).toEqual([50, 69.4444, 46.2962, 66.9752, 80.9464, 83.1618]);
      for (let i = 2; i < k.length; i++) {
        expect(j[i]).toBeCloseTo(3 * k[i]! - 2 * d[i]!, 3);
      }
    });

    it('should detect overbought (K > 80, D > 80)', () => {
      // 旧断言 const k=85, d=82 恒真；改为 25 根 RSV 恒为 90 的确定序列。
      const n = 25;
      const highs = Array.from({ length: n }, (_, i) => 10 + i);
      const lows = Array.from({ length: n }, (_, i) => 9 + i);
      const closes = Array.from({ length: n }, (_, i) => 9.9 + i);
      const { k, d, j } = calculateKDJ(highs, lows, closes, 9);
      expect(k[n - 1]).toBe(98.8144);
      expect(d[n - 1]).toBe(98.4175);
      expect(j[n - 1]).toBe(99.6083);
      expect(k[n - 1]!).toBeGreaterThan(80);
      expect(d[n - 1]!).toBeGreaterThan(80);
    });

    it('should detect oversold (K < 20, D < 20)', () => {
      // 旧断言 const k=15, d=18 恒真；改为 RSV 恒为 10 的镜像确定序列。
      const n = 25;
      const highs = Array.from({ length: n }, (_, i) => 20 - i);
      const lows = Array.from({ length: n }, (_, i) => 19 - i);
      const closes = Array.from({ length: n }, (_, i) => 19.1 - i);
      const { k, d, j } = calculateKDJ(highs, lows, closes, 9);
      expect(k[n - 1]).toBe(1.1856);
      expect(d[n - 1]).toBe(1.5825);
      expect(j[n - 1]).toBe(0.3917);
      expect(k[n - 1]!).toBeLessThan(20);
      expect(d[n - 1]!).toBeLessThan(20);
    });

    it('should handle equal high and low (RSV = 50)', () => {
      // 旧断言只断紧凑数组 length===1；生产为等长数组，只有最后一个 bar 有效。
      const { k, d, j } = calculateKDJ([10, 10, 10, 10, 10], [10, 10, 10, 10, 10], [10, 10, 10, 10, 10], 5);
      expect(k).toHaveLength(5);
      expect(k.slice(0, 4)).toEqual([null, null, null, null]);
      expect(k[4]).toBe(50);
      expect(d[4]).toBe(50);
      expect(j[4]).toBe(50);
    });
  });

  // BOLL (Bollinger Bands)
  describe('BOLL Bands', () => {
    it('should have upper > middle > lower', () => {
      // 旧断言对紧凑数组 forEach；生产为等长 null 预热数组，取最后一个有效 bar。
      const prices = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 5);
      const { upper, middle, lower } = calculateBollingerBands(prices, 20, 2);
      const last = prices.length - 1;
      expect(upper[last]).toBe(106.9);
      expect(middle[last]).toBe(100.0213);
      expect(lower[last]).toBe(93.1426);
      expect(upper[last]!).toBeGreaterThan(middle[last]!);
      expect(middle[last]!).toBeGreaterThan(lower[last]!);
    });

    it('should have zero band width for flat prices', () => {
      const prices = Array.from({ length: 20 }, () => 100);
      const { upper, middle, lower } = calculateBollingerBands(prices, 20, 2);
      const last = prices.length - 1;
      expect(upper[last]).toBe(100);
      expect(middle[last]).toBe(100);
      expect(lower[last]).toBe(100);
    });

    it('should increase band width with volatility', () => {
      // 旧断言只比较宽度大小；改为两条带在最后一个 bar 的确定宽度。
      const stable = Array.from({ length: 20 }, (_, i) => 100 + (i % 2) * 0.1);
      const volatile = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 === 0 ? 10 : -10));
      const bollStable = calculateBollingerBands(stable, 20, 2);
      const bollVolatile = calculateBollingerBands(volatile, 20, 2);
      const last = stable.length - 1;
      const widthStable = bollStable.upper[last]! - bollStable.lower[last]!;
      const widthVolatile = bollVolatile.upper[last]! - bollVolatile.lower[last]!;
      // 生产 upper/lower 各自由 toFixed(4) 舍入，相减存在 1e-15 级浮点尾差，
      // 故宽度用 10 位容差；三轨本身仍断确定值。
      expect(bollStable.upper[last]).toBe(100.15);
      expect(bollStable.lower[last]).toBe(99.95);
      expect(widthStable).toBeCloseTo(0.2, 10);
      expect(bollVolatile.upper[last]).toBe(120);
      expect(bollVolatile.lower[last]).toBe(80);
      expect(widthVolatile).toBe(40);
      expect(widthVolatile).toBeGreaterThan(widthStable);
    });

    it('should detect price near upper band', () => {
      // 旧断言用 +1 的宽松上界；改为生产三轨确定值 + 价格位置。
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
      const { upper, middle, lower } = calculateBollingerBands(prices, 10, 2);
      const last = prices.length - 1;
      const price = prices[prices.length - 1];
      expect(middle[last]).toBe(105.5);
      expect(upper[last]).toBe(111.2446);
      expect(lower[last]).toBe(99.7554);
      expect(price).toBeGreaterThanOrEqual(lower[last]!);
      expect(price).toBeLessThanOrEqual(upper[last]!);
    });

    it('should calculate with different multipliers', () => {
      // 旧断言取 boll[0]（紧凑数组首元素）；生产取 index=period-1 的有效 bar。
      const prices = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 3);
      const boll2 = calculateBollingerBands(prices, 20, 2);
      const boll3 = calculateBollingerBands(prices, 20, 3);
      const last = prices.length - 1;
      const width2 = boll2.upper[last]! - boll2.lower[last]!;
      const width3 = boll3.upper[last]! - boll3.lower[last]!;
      // 同上一例：两条舍入后的轨相减有浮点尾差，带宽用 10 位容差。
      expect(width2).toBeCloseTo(8.2544, 10);
      expect(width3).toBeCloseTo(12.3816, 10);
      expect(width3 / width2).toBeCloseTo(1.5, 3);
    });
  });

  // ATR (Average True Range)
  describe('ATR Indicator', () => {
    it('should calculate ATR correctly', () => {
      // 旧副本 TR[0]=high[0]-low[0]、返回紧凑 ATR 数组；生产 trueRange[0]=null（TR 从第 2 根起），
      // ATR 从 index=period 起才有值，且前 period-1 为 null。
      const highs = [48.70, 48.72, 48.90, 48.87, 48.82, 49.05, 49.20, 49.35, 49.92, 50.19, 50.12, 49.66, 49.88, 50.19, 50.36, 50.57, 50.65];
      const lows = [47.79, 48.14, 48.39, 48.37, 48.24, 48.64, 48.94, 48.86, 49.50, 49.87, 49.20, 49.43, 49.43, 49.84, 49.96, 50.14, 50.21];
      const closes = [48.16, 48.61, 48.75, 48.63, 48.74, 49.03, 49.07, 49.32, 49.91, 50.13, 49.53, 49.55, 49.81, 50.13, 50.32, 50.54, 50.44];
      const { atr, trueRange } = calculateATR(highs, lows, closes, 14);
      expect(atr).toHaveLength(17);
      expect(trueRange[0]).toBeNull();
      expect(trueRange[1]).toBe(0.58);
      expect(atr.slice(0, 14)).toEqual(Array(14).fill(null));
      expect(atr[14]).toBe(0.4743);
      expect(atr[15]).toBe(0.4711);
      expect(atr[16]).toBe(0.4689);
      atr.slice(14).forEach(a => expect(a!).toBeGreaterThan(0));
    });

    it('should have ATR > 0 for any volatile market', () => {
      // 旧用例用 Math.random；改为每根 TR 恒为 4 的确定序列，ATR 全为 4。
      const n = 20;
      const highs = Array.from({ length: n }, (_, i) => 100 + i * 0.5 + 2);
      const lows = Array.from({ length: n }, (_, i) => 100 + i * 0.5 - 2);
      const closes = Array.from({ length: n }, (_, i) => 100 + i * 0.5);
      const { atr, trueRange } = calculateATR(highs, lows, closes, 14);
      expect(atr).toHaveLength(20);
      expect(trueRange[0]).toBeNull();
      expect(atr.slice(14)).toEqual([4, 4, 4, 4, 4, 4]);
      atr.slice(14).forEach(a => expect(a!).toBeGreaterThan(0));
    });

    it('should return null for insufficient data', () => {
      // 旧断言只断 length<=1（单根时恒真）；生产明确返回 [null]/[null]。
      const { atr, trueRange } = calculateATR([100], [99], [99.5], 14);
      expect(atr).toEqual([null]);
      expect(trueRange).toEqual([null]);
    });
  });

  // Support and Resistance
  describe('Support and Resistance', () => {
    const highs = [10, 12, 14, 12, 10, 11, 13, 15, 13, 11];
    const lows = [8, 10, 12, 10, 8, 9, 11, 13, 11, 9];

    it('should find pivot highs and lows', () => {
      // 生产 findPivots 返回索引（momentumDivergenceEngine.ts:139），这里做索引→价格映射。
      const highPivots = findPivots(highs, 2);
      const lowPivots = findPivots(lows, 2);
      const resistances = highPivots.highs.map(i => highs[i]);
      const supports = lowPivots.lows.map(i => lows[i]);
      expect(highPivots.highs).toEqual([2, 7]);
      expect(lowPivots.lows).toEqual([4]);
      expect(resistances).toEqual([14, 15]);
      expect(supports).toEqual([8]);
    });

    it('should have resistance > support', () => {
      // 旧用例用 if (length && length) 守卫，条件不成立时零断言；改为无守卫的确定值。
      const highPivots = findPivots(highs, 2);
      const lowPivots = findPivots(lows, 2);
      const resistances = highPivots.highs.map(i => highs[i]);
      const supports = lowPivots.lows.map(i => lows[i]);
      expect(Math.min(...resistances)).toBe(14);
      expect(Math.max(...supports)).toBe(8);
      expect(Math.min(...resistances)).toBeGreaterThan(Math.max(...supports));
    });
  });

  // Fibonacci Retracement
  describe('Fibonacci Retracement', () => {
    it('should calculate correct Fibonacci levels', () => {
      const levels = fibLevels(100, 50);
      expect(levels.level0).toBe(100);
      expect(levels.level500).toBe(75);
      expect(levels.level100).toBe(50);
    });

    it('should have levels in descending order', () => {
      const levels = fibLevels(200, 100);
      expect(levels.level0).toBe(200);
      expect(levels.level0).toBeGreaterThan(levels.level236);
      expect(levels.level236).toBeGreaterThan(levels.level382);
      expect(levels.level382).toBeGreaterThan(levels.level500);
      expect(levels.level500).toBeGreaterThan(levels.level618);
      expect(levels.level618).toBeGreaterThan(levels.level786);
      expect(levels.level786).toBeGreaterThan(levels.level100);
    });

    it('should apply golden ratio (0.618)', () => {
      const levels = fibLevels(161.8, 100);
      expect(levels.level618).toBeCloseTo(161.8 - 61.8 * 0.618, 10);
      expect(levels.level618).toBeCloseTo(123.6076, 10);
    });

    it('should handle equal high and low', () => {
      const levels = fibLevels(100, 100);
      expect(levels.level0).toBe(100);
      expect(levels.level100).toBe(100);
      expect(levels.level500).toBe(100);
      expect(levels.level618).toBe(100);
    });
  });

  // Trend detection
  describe('Trend Detection', () => {
    it('should detect uptrend', () => {
      // 旧断言期望字符串 'up'；生产 detectTrend 返回对象，方向在 .direction。
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
      const trend = detectTrend(prices, 10);
      expect(trend.direction).toBe('up');
      expect(trend.startIdx).toBe(10);
      expect(trend.endIdx).toBe(19);
    });

    it('should detect downtrend', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 200 - i * 2);
      const trend = detectTrend(prices, 10);
      expect(trend.direction).toBe('down');
      expect(trend.startIdx).toBe(10);
      expect(trend.endIdx).toBe(19);
    });

    it('should detect sideways trend', () => {
      // 旧断言期望 'sideways'；生产用回归斜率，阈值 ±0.01，该序列斜率 0.00303 → 'neutral'。
      const prices = Array.from({ length: 20 }, (_, i) => 100 + (i % 2) * 0.1);
      const trend = detectTrend(prices, 10);
      expect(trend.direction).toBe('neutral');
    });

    it('should return neutral for insufficient data', () => {
      const trend = detectTrend([1, 2], 10);
      expect(trend.direction).toBe('neutral');
      expect(trend.strength).toBe(0);
      expect(trend.startIdx).toBe(0);
      expect(trend.endIdx).toBe(1);
    });
  });

  // Divergence detection
  describe('Divergence Detection', () => {
    it('should detect bullish divergence', () => {
      // 旧副本只看最后两根 K 线（3 点夹具）；生产 detectDivergences 用枢轴配对，
      // 最少需要 lookback*2+1 根，故改用 13 根、lookback=2 的确定夹具。
      const prices = [100, 98, 95, 97, 100, 103, 96, 92, 95, 99, 102, 99, 96];
      const indicator = [50, 45, 40, 44, 48, 52, 46, 43, 45, 50, 54, 51, 48];
      const signals = detectDivergences(prices, indicator, 2);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('bullish_divergence');
      expect(signals[0].strength).toBe(14);
      expect(signals[0].confidence).toBeCloseTo(0.628, 10);
      expect(signals[0].pricePoints).toEqual([{ index: 2, value: 95 }, { index: 7, value: 92 }]);
      expect(signals[0].indicatorPoints).toEqual([{ index: 2, value: 40 }, { index: 7, value: 43 }]);
    });

    it('should detect bearish divergence', () => {
      const prices = [100, 95, 90, 92, 95, 98, 93, 88, 94, 100, 97, 93, 90];
      const indicator = [50, 45, 40, 42, 48, 60, 44, 38, 46, 55, 43, 39, 35];
      const signals = detectDivergences(prices, indicator, 2);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('bearish_divergence');
      expect(signals[0].strength).toBe(12);
      expect(signals[0].confidence).toBeCloseTo(0.624, 10);
      expect(signals[0].pricePoints).toEqual([{ index: 5, value: 98 }, { index: 9, value: 100 }]);
      expect(signals[0].indicatorPoints).toEqual([{ index: 5, value: 60 }, { index: 9, value: 55 }]);
    });

    it('should not detect divergence in aligned movement', () => {
      // 旧断言对 3 点夹具调两个布尔函数；改为生产枢轴引擎在同向价格/指标上不产生信号。
      const values = [100, 95, 90, 92, 95, 98, 93, 88, 94, 100, 97, 93, 90];
      const signals = detectDivergences(values, values, 2);
      expect(signals).toEqual([]);
      expect(signals.filter(s => s.type === 'bullish_divergence')).toHaveLength(0);
      expect(signals.filter(s => s.type === 'bearish_divergence')).toHaveLength(0);
    });

    it('should handle empty arrays', () => {
      // 生产提前返回 []（长度 < lookback*2+1），不再返回布尔值。
      expect(detectDivergences([], [], 2)).toEqual([]);
      expect(detectDivergences([100, 95], [50, 45], 2)).toEqual([]);
    });
  });

  // Cross signal detection
  describe('Cross Signal Detection', () => {
    it('should detect golden cross', () => {
      // 旧副本返回字符串；生产 detectCrossovers 返回 TrendSignal[]，这里构造仅 ma5/ma10
      // 有效的 3 行数据（其余均线 NaN 会被 isNaN 跳过）。
      const signals = detectCrossovers([
        maRow(0, 10, 9, 10),
        maRow(1, 10, 10, 10),
        maRow(2, 11, 11, 10),
      ]);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('golden_cross');
      expect(signals[0].ma).toBe('ma5');
      expect(signals[0].price).toBe(11);
      expect(signals[0].maValue).toBe(10);
      expect(signals[0].strength).toBe(100);
      expect(signals[0].direction).toBe('bullish');
      expect(signals[0].description).toContain('金叉');
    });

    it('should detect death cross', () => {
      const signals = detectCrossovers([
        maRow(0, 11, 11, 10),
        maRow(1, 10, 10, 10),
        maRow(2, 9, 9, 10),
      ]);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('death_cross');
      expect(signals[0].ma).toBe('ma5');
      expect(signals[0].price).toBe(9);
      expect(signals[0].maValue).toBe(10);
      expect(signals[0].strength).toBe(100);
      expect(signals[0].direction).toBe('bearish');
      expect(signals[0].description).toContain('死叉');
    });

    it('should return null when no cross', () => {
      const signals = detectCrossovers([
        maRow(0, 10, 10, 9),
        maRow(1, 11, 11, 9),
        maRow(2, 12, 12, 9),
      ]);
      expect(signals).toHaveLength(0);
      expect(signals).toEqual([]);
    });

    it('should return null for insufficient data', () => {
      expect(detectCrossovers([maRow(0, 10, 9, 10)])).toEqual([]);
      expect(detectCrossovers([])).toEqual([]);
    });
  });
});
