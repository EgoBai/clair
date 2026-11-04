import { describe, it, expect } from 'vitest';
import { calculateMA } from '../utils/trendFollowingEngine';
import { calculateEMA, calculateMomentum, calculateWilliamsR } from '../utils/featureEngineeringEngine';
import { calculateBollingerBands } from '../utils/chartDataProcessing';
import { calcMACD, calcRSI } from '../../../backend/src/utils/futureValueUtils';

/**
 * 交易策略引擎（frontend 影子测试 → 生产实现绑定）
 * =============================================================================
 * 一、原自抄实现的问题
 * 1. sma/ema/macd/rsi/bollinger 与生产指标引擎逐行重复；其中 bollinger 预热返回
 *    {upper:NaN, middle:NaN, lower:NaN} 对象，rsI 预热返回 NaN——NaN 会静默扩散，
 *    生产用 null 明确表达空态。
 * 2. shadow momentum 先用 Array(period).fill(NaN) 再向后 push，period>prices.length 时
 *    返回长度 period（比输入还长），信号数组随之一并错位；生产 calculateMomentum 恒返回
 *    prices.length。
 * 3. shadow MACD 是 2 倍柱口径（与 futureValueUtils.calcMACD 相同），但自抄无 null 预热、
 *    dea 无位移、也没有慢线 warm-up；10 点数据在自抄下能得到数值，生产 slow=26 时全 null。
 * 4. shadow williamsR 在 highest===lowest 时除以 0 得 NaN；生产 calculateWilliamsR 返回 -50。
 * 5. 布林带两个用例用无种子随机数造夹具，不可复现。
 *
 * 二、绑定生产实现（file:line）
 * - sma → frontend/src/utils/trendFollowingEngine.ts:73 calculateMA(prices, period)
 *   i<period-1 为 NaN、窗口均值，与自抄同构。
 * - ema → frontend/src/utils/featureEngineeringEngine.ts:45 calculateEMA(prices, period)
 *   首值作种子、逐点递推，与自抄同构。
 * - calcRSI → backend/src/utils/futureValueUtils.ts:59 calcRSI(closes, period=14)
 *   null 预热（前 period 位）、索引 period 出首个值、Wilder 平滑；与自抄唯一差异是空态
 *   NaN→null。未选 backend/src/services/chartDataEngine.ts:36 calcRSI（紧凑数组、无预热），
 *   也未选 backend/src/indicators/technical.ts:233 与 frontend/src/utils/chartDataProcessing.ts:111
 *   （与 futureValueUtils 同构但多 toFixed(4)）。
 * - calcMACD → backend/src/utils/futureValueUtils.ts:109 calcMACD(closes, fast, slow, signal)
 *   histogram = 2*(dif-dea)，与自抄 2 倍柱同口径；dif 从 slow-1 起、dea 前移 signal-1 位。
 *   未选 frontend/src/utils/featureEngineeringEngine.ts:85 calculateMACD 与
 *   backend/src/indicators/technical.ts:168 calculateMACD：两者柱为 macd-signal（无 2 倍）。
 * - 布林带 → frontend/src/utils/chartDataProcessing.ts:145 calculateBollingerBands(closes, period, stdMultiplier)
 *   null 预热 + 总体标准差（/period），返回对象或 null。
 * - momentum → frontend/src/utils/featureEngineeringEngine.ts:266 calculateMomentum(prices, period)
 *   NaN 预热，长度恒为 prices.length。
 * - williamsR → frontend/src/utils/featureEngineeringEngine.ts:218 calculateWilliamsR(high[], low[], close[], period)
 *   NaN 预热；range===0 返回 -50。
 *
 * 三、未迁移清单及原因（保留本地内联）
 * - goldenCross/deathCross：trendFollowingEngine.ts:113 detectCrossovers 只接受
 *   (MAValues&{date,close})[] 且固定 5 组均线对，返回对象数组；strategy.ts:122 把 MA5/MA20
 *   交叉写死。无接受任意 short[]/long[] 的导出。
 * - trailingStop(prices, stopPct, takePct)：trendFollowingEngine.ts:298
 *   calculateStopLossTakeProfit(entryPrice, atr, method, maValue) 返回级别值；
 *   backend/src/services/adaptiveStopLossEngine.ts 是吊灯止损——契约不同。
 * - momentumSignal：生产无「动量符号翻转」信号导出，映射逻辑保留内联，内部动量改调
 *   calculateMomentum。
 * - calcATR（Wilder，TR[0] 含、atr[period-1] 作种子）：backend/src/indicators/technical.ts:461
 *   返回 {atr,trueRange} 且 TR 从索引 1 起、atr[period] 作种子；frontend 两版
 *   （trendFollowingEngine.ts:376、featureEngineeringEngine.ts:136）都是 TR 的 SMA。
 *   无同契约导出。
 *
 * 四、旧断言订正
 * - RSI「NaN个数」：生产空态是 null 不是 NaN；旧 filter(isNaN) 对 null 得 false，计数虽仍为 14
 *   但语义错了，改为 ===null，并补 rsi[13] null / rsi[14] 非 null。
 * - BOLL「不足周期返回NaN」：生产返回 null 对象数组，旧断言 b.upper 会抛 TypeError；改为 toBeNull。
 * - MACD「长度一致」10 点数据：生产 slow=26 → 三条全 null，旧断言只查长度掩盖了这一点；
 *   新增全 null 断言。
 * - momentum「不足周期」：旧影子返回长度 5（Array(period) 预热），生产返回长度 3；
 *   新断言长度 3。
 * - williamsR 不足周期：新增长度=2 断言。
 * - 布林带两处随机夹具改固定种子 Math.imul LCG。
 */

describe('Trading Strategy Engine', () => {
  // 确定性夹具：32 位 LCG（固定种子），替代原无种子随机数，保证逐位可复现。
  const lcg = (seed: number) => {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  };

  // 未迁移：生产无接受任意 short[]/long[] 的交叉检测导出（见文件头第三节）。
  const goldenCross = (short: number[], long: number[]): number[] => {
    const signals: number[] = [];
    for (let i = 1; i < short.length; i++) {
      if (isNaN(short[i]) || isNaN(long[i]) || isNaN(short[i-1]) || isNaN(long[i-1])) continue;
      if (short[i-1] <= long[i-1] && short[i] > long[i]) signals.push(i);
    }
    return signals;
  };

  // 未迁移：同上。
  const deathCross = (short: number[], long: number[]): number[] => {
    const signals: number[] = [];
    for (let i = 1; i < short.length; i++) {
      if (isNaN(short[i]) || isNaN(long[i]) || isNaN(short[i-1]) || isNaN(long[i-1])) continue;
      if (short[i-1] >= long[i-1] && short[i] < long[i]) signals.push(i);
    }
    return signals;
  };

  describe('简单移动平均', () => {
    it('基本计算', () => {
      const result = calculateMA([1, 2, 3, 4, 5], 3);
      expect(result[2]).toBe(2);
      expect(result[4]).toBe(4);
      // trendFollowingEngine.ts:73：预热段为 NaN。
      expect(result).toEqual([NaN, NaN, 2, 3, 4]);
    });

    it('周期为1', () => {
      const result = calculateMA([10, 20, 30], 1);
      expect(result).toEqual([10, 20, 30]);
    });

    it('周期等于数据长度', () => {
      const result = calculateMA([10, 20, 30], 3);
      expect(result[2]).toBe(20);
      expect(Number.isNaN(result[0])).toBe(true);
      expect(Number.isNaN(result[1])).toBe(true);
    });

    it('不足周期返回NaN', () => {
      const result = calculateMA([1, 2, 3, 4, 5], 3);
      expect(isNaN(result[0])).toBe(true);
      expect(isNaN(result[1])).toBe(true);
    });

    it('单元素数据', () => {
      const result = calculateMA([42], 1);
      expect(result).toEqual([42]);
    });

    it('相同值', () => {
      const result = calculateMA([5, 5, 5, 5], 2);
      expect(result[1]).toBe(5);
      expect(result[3]).toBe(5);
    });

    it('负值处理', () => {
      const result = calculateMA([-10, 0, 10], 3);
      expect(result[2]).toBe(0);
    });

    it('大周期', () => {
      const data = Array(100).fill(1);
      const result = calculateMA(data, 50);
      expect(result[49]).toBe(1);
      expect(result[99]).toBe(1);
      expect(Number.isNaN(result[48])).toBe(true);
    });
  });

  describe('指数移动平均', () => {
    it('首值等于数据首值', () => {
      const result = calculateEMA([100, 200, 300], 3);
      expect(result[0]).toBe(100);
    });

    it('趋势上升', () => {
      const result = calculateEMA([1, 2, 3, 4, 5], 3);
      expect(result[4]).toBeGreaterThan(result[0]);
    });

    it('相同值保持不变', () => {
      const result = calculateEMA([10, 10, 10, 10], 3);
      expect(result[3]).toBeCloseTo(10, 5);
    });

    it('长度匹配', () => {
      const result = calculateEMA([1, 2, 3], 2);
      expect(result.length).toBe(3);
    });

    it('权重递减', () => {
      const result = calculateEMA([10, 20, 30, 40, 50], 3);
      expect(result[4]).toBeGreaterThan(result[3]);
      // k=0.5，首值 10 作种子；featureEngineeringEngine.ts:45 保留原始 double。
      expect(result).toEqual([10, 15, 22.5, 31.25, 40.625]);
    });
  });

  describe('金叉死叉信号', () => {
    it('检测金叉', () => {
      const short = [1, 2, 3, 5, 6];
      const long = [4, 4, 4, 4, 4];
      const signals = goldenCross(short, long);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals).toEqual([3]);
    });

    it('检测死叉', () => {
      const short = [5, 4, 3, 2, 1];
      const long = [3, 3, 3, 3, 3];
      const signals = deathCross(short, long);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals).toEqual([3]);
    });

    it('无交叉', () => {
      const short = [1, 1, 1, 1];
      const long = [5, 5, 5, 5];
      expect(goldenCross(short, long).length).toBe(0);
    });

    it('跳过NaN', () => {
      const short = [NaN, NaN, 3, 5];
      const long = [NaN, NaN, 4, 4];
      const signals = goldenCross(short, long);
      expect(signals.length).toBeGreaterThanOrEqual(0);
      expect(signals).toEqual([3]);
    });

    it('频繁交叉', () => {
      const short = [1, 5, 1, 5, 1];
      const long = [3, 3, 3, 3, 3];
      const gc = goldenCross(short, long);
      const dc = deathCross(short, long);
      expect(gc).toEqual([1, 3]);
      expect(dc).toEqual([2, 4]);
    });
  });

  describe('RSI指标', () => {
    it('RSI范围0-100', () => {
      const prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
      const rsi = calcRSI(prices, 5);
      const valid = rsi.filter((r): r is number => r !== null);
      // futureValueUtils.ts:59：前 period 位为 null。
      expect(valid).toHaveLength(prices.length - 5);
      valid.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(100);
      });
      expect(rsi[19]).toBeCloseTo(38.6419, 4);
    });

    it('持续上涨RSI高', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const rsi = calcRSI(prices, 5);
      const last = rsi[rsi.length - 1];
      expect(last).toBeGreaterThan(70);
      // avgLoss===0 → 100。
      expect(last).toBe(100);
    });

    it('持续下跌RSI低', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 - i);
      const rsi = calcRSI(prices, 5);
      const last = rsi[rsi.length - 1];
      expect(last).toBeLessThan(30);
      expect(last).toBe(0);
    });

    it('空值预热个数正确', () => {
      const prices = Array.from({ length: 20 }, (_, i) => i);
      const rsi = calcRSI(prices, 14);
      const nullCount = rsi.filter(r => r === null).length;
      expect(nullCount).toBe(14);
      expect(rsi[13]).toBeNull();
      expect(rsi[14]).not.toBeNull();
      expect(rsi.length).toBe(20);
    });

    it('周期为1特殊情况', () => {
      const prices = [10, 12, 11, 13];
      const rsi = calcRSI(prices, 1);
      expect(rsi.length).toBe(prices.length);
      // 索引 1 +2→100、索引 2 -1→0、索引 3 +2→100（Wilder period=1）。
      expect(rsi).toEqual([null, 100, 0, 100]);
    });

    it('数据不足 period+1 时全 null', () => {
      const rsi = calcRSI([1, 2, 3], 14);
      expect(rsi).toHaveLength(3);
      expect(rsi.every(r => r === null)).toBe(true);
    });
  });

  describe('MACD指标', () => {
    it('DIF零轴附近', () => {
      const prices = Array(50).fill(100);
      const { dif } = calcMACD(prices);
      const last = dif[dif.length - 1];
      expect(Math.abs(last as number)).toBeLessThan(1);
      // 恒定序列下快慢 EMA 完全相等 → DIF 精确为 0；前 slow-1 位为 null。
      expect(last).toBe(0);
      expect(dif.filter(v => v === null)).toHaveLength(25);
    });

    it('MACD柱存在', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 10);
      const { dif, dea, histogram: macd } = calcMACD(prices);
      expect(macd.length).toBe(prices.length);
      // futureValueUtils.ts:129：startIdx = slow-1 + signal-1 = 33。
      expect(macd[32]).toBeNull();
      expect(macd[33]).toBeCloseTo(0.5492, 4);
      // 2 倍柱口径：histogram = 2*(dif-dea)。
      expect(macd[33]).toBeCloseTo(2 * ((dif[33] as number) - (dea[33] as number)), 5);
    });

    it('趋势上升DIF为正', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
      const { dif } = calcMACD(prices);
      expect(dif[dif.length - 1]).toBeGreaterThan(0);
    });

    it('长度一致', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { dif, dea, histogram: macd } = calcMACD(prices);
      expect(dif.length).toBe(dea.length);
      expect(dif.length).toBe(macd.length);
      // slow=26 > 10：三条都应是 null 预热（自抄同输入会给出数值，旧断言掩盖了差异）。
      expect(dif.every(v => v === null)).toBe(true);
      expect(dea.every(v => v === null)).toBe(true);
      expect(macd.every(v => v === null)).toBe(true);
    });

    it('恒定价差DIF接近零', () => {
      const prices = Array(30).fill(50);
      const { dif } = calcMACD(prices, 3, 6, 3);
      expect(Math.abs(dif[dif.length - 1] as number)).toBeLessThan(0.01);
      expect(dif[29]).toBe(0);
      expect(dif.filter(v => v === null)).toHaveLength(5);
    });
  });

  describe('布林带', () => {
    it('上轨大于中轨大于下轨', () => {
      const rand = lcg(20240101);
      const data = Array.from({ length: 30 }, () => rand() * 100);
      const bb = calculateBollingerBands(data);
      const valid = bb.filter((b): b is { upper: number; middle: number; lower: number } => b !== null);
      expect(valid).toHaveLength(11);
      valid.forEach(b => {
        expect(b.upper).toBeGreaterThan(b.middle);
        expect(b.middle).toBeGreaterThan(b.lower);
      });
    });

    it('恒定数据带宽为零', () => {
      const data = Array(25).fill(42);
      const bb = calculateBollingerBands(data);
      const last = bb[bb.length - 1];
      expect(last).toEqual({ upper: 42, middle: 42, lower: 42 });
      expect(last!.upper).toBeCloseTo(42, 5);
      expect(last!.lower).toBeCloseTo(42, 5);
    });

    it('多倍数带宽变大', () => {
      const rand = lcg(7);
      const data = Array.from({ length: 30 }, (_, i) => i + rand() * 5);
      const bb2 = calculateBollingerBands(data, 10, 2);
      const bb3 = calculateBollingerBands(data, 10, 3);
      const last2 = bb2[bb2.length - 1];
      const last3 = bb3[bb3.length - 1];
      expect(last2).not.toBeNull();
      expect(last3).not.toBeNull();
      expect(last3!.upper - last3!.lower).toBeGreaterThan(last2!.upper - last2!.lower);
    });

    it('不足周期返回null', () => {
      const bb = calculateBollingerBands([1, 2, 3], 5);
      expect(bb).toHaveLength(3);
      bb.forEach(b => expect(b).toBeNull());
    });

    it('结果长度匹配', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const bb = calculateBollingerBands(data, 3);
      expect(bb.length).toBe(10);
      expect(bb.slice(0, 2)).toEqual([null, null]);
      expect(bb[2]).not.toBeNull();
    });
  });

  // 未迁移：生产只有级别型止损/吊灯止损，无逐 bar 扫描的 stop/take 信号（见文件头第三节）。
  const trailingStop = (prices: number[], stopPct: number, takePct: number) => {
    let peak = prices[0];
    let trough = prices[0];
    const signals: { type: 'stop' | 'take'; index: number; price: number }[] = [];
    for (let i = 1; i < prices.length; i++) {
      peak = Math.max(peak, prices[i]);
      trough = Math.min(trough, prices[i]);
      if (prices[i] <= peak * (1 - stopPct / 100)) {
        signals.push({ type: 'stop', index: i, price: prices[i] });
        break;
      }
      if (prices[i] >= prices[0] * (1 + takePct / 100)) {
        signals.push({ type: 'take', index: i, price: prices[i] });
        break;
      }
    }
    return signals;
  };

  describe('止损止盈', () => {
    it('触发止损', () => {
      const prices = [100, 102, 101, 97, 95];
      const signals = trailingStop(prices, 3, 10);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('stop');
      expect(signals[0].index).toBe(3);
    });

    it('触发止盈', () => {
      const prices = [100, 103, 107, 112];
      const signals = trailingStop(prices, 5, 5);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('take');
      // 索引 2 的 107 首次越过 100*(1+5%)。
      expect(signals[0].index).toBe(2);
    });

    it('无触发', () => {
      const prices = [100, 101, 100, 101, 100];
      const signals = trailingStop(prices, 5, 5);
      expect(signals.length).toBe(0);
    });

    it('首日触发', () => {
      const prices = [100, 80];
      const signals = trailingStop(prices, 10, 10);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('stop');
      expect(signals[0].index).toBe(1);
    });

    it('止盈优先', () => {
      const prices = [100, 106];
      const signals = trailingStop(prices, 10, 5);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('take');
    });

    it('价格震荡不触发', () => {
      const prices = [100, 99, 101, 98, 102, 99, 101];
      const signals = trailingStop(prices, 5, 5);
      expect(signals.length).toBe(0);
    });
  });

  // 未迁移：生产无「动量符号翻转」信号导出（见文件头第三节）。
  const momentumSignal = (prices: number[], period: number): ('buy' | 'sell' | 'hold')[] => {
    const mom = calculateMomentum(prices, period);
    return mom.map((m, i) => {
      if (isNaN(m) || i === 0) return 'hold';
      const prev = mom[i - 1];
      if (isNaN(prev)) return 'hold';
      if (prev <= 0 && m > 0) return 'buy';
      if (prev >= 0 && m < 0) return 'sell';
      return 'hold';
    });
  };

  describe('动量策略', () => {
    it('动量计算', () => {
      const prices = [10, 12, 11, 15, 14];
      const mom = calculateMomentum(prices, 2);
      expect(mom[2]).toBe(1);   // 11 - 10
      expect(mom[3]).toBe(3);   // 15 - 12
      expect(mom).toHaveLength(5);
      expect(Number.isNaN(mom[0])).toBe(true);
      expect(Number.isNaN(mom[1])).toBe(true);
    });

    it('买入信号', () => {
      const prices = [10, 9, 8, 9, 11, 13];
      const signals = momentumSignal(prices, 2);
      expect(signals).toContain('buy');
    });

    it('卖出信号', () => {
      const prices = [10, 12, 14, 13, 11, 9];
      const signals = momentumSignal(prices, 2);
      expect(signals).toContain('sell');
    });

    it('长度匹配', () => {
      const prices = [1, 2, 3, 4, 5];
      const signals = momentumSignal(prices, 2);
      expect(signals.length).toBe(5);
    });

    it('不足周期为hold', () => {
      const prices = [1, 2, 3];
      const signals = momentumSignal(prices, 5);
      // 自抄 momentum 用 Array(period) 预热，这里会返回 5 个信号；生产长度=3。
      expect(signals).toHaveLength(3);
      signals.forEach(s => expect(s).toBe('hold'));
    });
  });

  // 未迁移：生产 ATR 两版契约均不同（见文件头第三节）。
  const calcATR = (high: number[], low: number[], close: number[], period: number): number[] => {
    const tr: number[] = [high[0] - low[0]];
    for (let i = 1; i < high.length; i++) {
      tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
    }
    const atr: number[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) { sum += tr[i]; atr.push(NaN); }
    atr[period - 1] = sum / period;
    for (let i = period; i < tr.length; i++) {
      atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
    }
    return atr;
  };

  describe('ATR指标', () => {
    it('ATR为正', () => {
      const atr = calcATR([10,11,12,11,10], [8,9,10,9,8], [9,10,11,10,9], 3);
      atr.filter(a => !isNaN(a)).forEach(a => expect(a).toBeGreaterThan(0));
    });

    it('波动增大ATR增大', () => {
      const high = [10, 10, 10, 20, 20, 20];
      const low =  [8,  8,  8,  5,  5,  5];
      const close = [9, 9, 9, 12, 12, 12];
      const atr = calcATR(high, low, close, 3);
      const last = atr[atr.length - 1];
      const mid = atr[4];
      expect(last).toBeGreaterThanOrEqual(mid!);
    });

    it('长度一致', () => {
      const atr = calcATR([1,2,3,4,5], [0,1,2,3,4], [0.5,1.5,2.5,3.5,4.5], 3);
      expect(atr.length).toBe(5);
    });

    it('恒定价格ATR接近零', () => {
      const atr = calcATR(Array(10).fill(10), Array(10).fill(10), Array(10).fill(10), 3);
      const last = atr[atr.length - 1];
      expect(last).toBeCloseTo(0, 5);
    });
  });

  describe('威廉指标', () => {
    it('范围-100到0', () => {
      const w = calculateWilliamsR([10,11,12,13,14], [8,9,10,11,12], [9,10,11,12,13], 3);
      expect(w).toHaveLength(5);
      expect(w.filter(v => !isNaN(v))).toHaveLength(3);
      w.filter(v => !isNaN(v)).forEach(v => {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(0);
      });
    });

    it('收盘价在最高位为0', () => {
      const w = calculateWilliamsR([10,10,10], [5,5,5], [10,10,10], 3);
      expect(Math.abs(w[2])).toBe(0);
      expect(w[2]).toBeCloseTo(0, 5);
    });

    it('收盘价在最低位为-100', () => {
      const w = calculateWilliamsR([10,10,10], [5,5,5], [5,5,5], 3);
      expect(w[2]).toBeCloseTo(-100, 5);
      expect(w[2]).toBe(-100);
    });

    it('不足周期NaN', () => {
      const w = calculateWilliamsR([1,2], [0,1], [0.5,1.5], 5);
      expect(w).toHaveLength(2);
      w.forEach(v => expect(isNaN(v)).toBe(true));
    });

    it('高低相等时返回-50', () => {
      const w = calculateWilliamsR([10,10,10], [10,10,10], [10,10,10], 3);
      // featureEngineeringEngine.ts:218：range===0 时返回 -50（自抄会除以 0 得 NaN）。
      expect(w[2]).toBe(-50);
    });
  });
});
