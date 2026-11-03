/**
 * 影子测试迁移（批次 22a）
 *
 * 旧文件在测试内自抄了 SMA / EMA / WMA / 金叉 / 三均线五套实现（只 import vitest），断言的是副本
 * 而不是产品。本批把 SMA/EMA 两组改为 import 真实生产实现，其余保留本地 helper 并逐处注明原因。
 *
 * 已绑定生产实现：
 * - calculateSMA → frontend/src/utils/chartDataProcessing.ts:73
 * - calculateEMA → frontend/src/utils/chartDataProcessing.ts:89
 *   （null 预热、EMA 以前 period 个值的 SMA 播种、multiplier = 2/(period+1)；跨包 import 与选型理由
 *    同 backend/src/__tests__/maAndVolumeAnalysis.test.ts:39（批次 19）。未选
 *    frontend/src/utils/featureEngineeringEngine.ts:32/45 的同名实现：其 SMA 预热为 NaN、EMA 以首价
 *    播种、不产生 null，与本文件下游「null 跳过」契约不兼容。）
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * - EMA「starting from first price」：旧副本以首价播种，period=2 时 [10,20,30] → [10, 16.667]；生产
 *   null 预热 + SMA 播种 → [null, 15, 25]。旧 10 → 生产 null；旧 16.667 → 生产 15。
 * - EMA 趋势用例：旧副本无 null 预热（从 i=1 起每项都是数），比较从 i=1 开始；生产前 period-1 项为
 *   null，改为从首个有效值（i=period）起比较；非空段数值 [2,3,...,10] 与旧副本一致。
 * - SMA 五例与生产逐条一致（null 预热与窗口均值口径相同），断言值不变，只把断言对象从副本换成 import。
 *
 * 未迁移——生产无对应导出（保留本地 helper，其数值断言不对生产作声明）：
 * - calculateWMA：全仓无导出（grep calculateWMA 仅命中测试）；同 maAndVolumeAnalysis.test.ts:22/44（批次 19）。
 * - goldenCrossStrategy：生产无通用金叉/死叉函数，只有写死均线对的组件内联判断
 *   （frontend/src/utils/marketTimingEngine.ts:163/167 为 MA50/200；frontend/src/utils/strategy.ts:121/125
 *   为 MA5/20），与 (number|null)[] + prices 的通用签名不同。
 * - tripleMASystem：生产无三均线系统导出；本地只保留信号状态机，均线原语改用上方生产 calculateSMA
 *   （null 预热契约一致），信号判定因此建立在生产 SMA 之上。
 *
 * 生产缺陷候选：无。calculateEMA 的 null 预热 + SMA 播种是标准口径，旧副本的首价播种才是偏差，
 * 未发现与标准 EMA 定义冲突的生产行为。
 */

import { describe, it, expect } from 'vitest';
import { calculateSMA, calculateEMA } from '../../../frontend/src/utils/chartDataProcessing';

// Moving Average Systems
interface MACrossResult { signals: { date: number; type: 'buy' | 'sell'; price: number }[]; winRate: number }

// 未迁移：生产无对应导出（calculateWMA 全仓仅测试出现），保留本地 helper。
function calculateWMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const weightSum = (period * (period + 1)) / 2;
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let weightedSum = 0;
    for (let j = 0; j < period; j++) {
      weightedSum += prices[i - period + 1 + j] * (j + 1);
    }
    result.push(weightedSum / weightSum);
  }
  return result;
}

// 未迁移：生产无通用交叉检测函数（见文件头），保留本地策略 helper。
function goldenCrossStrategy(shortMA: (number | null)[], longMA: (number | null)[], prices: number[]): MACrossResult {
  const signals: MACrossResult['signals'] = [];
  let position = false;
  for (let i = 1; i < prices.length; i++) {
    if (shortMA[i] === null || longMA[i] === null || shortMA[i - 1] === null || longMA[i - 1] === null) continue;
    if (shortMA[i]! > longMA[i]! && shortMA[i - 1]! <= longMA[i - 1]! && !position) {
      signals.push({ date: i, type: 'buy', price: prices[i] });
      position = true;
    } else if (shortMA[i]! < longMA[i]! && shortMA[i - 1]! >= longMA[i - 1]! && position) {
      signals.push({ date: i, type: 'sell', price: prices[i] });
      position = false;
    }
  }
  let wins = 0, total = 0;
  for (let i = 0; i < signals.length - 1; i += 2) {
    if (signals[i + 1] && signals[i + 1].price > signals[i].price) wins++;
    total++;
  }
  return { signals, winRate: total > 0 ? wins / total : 0 };
}

// 未迁移（策略层）：生产无三均线系统导出；均线原语使用生产 calculateSMA，本地只保留信号状态机。
function tripleMASystem(prices: number[], fast: number, mid: number, slow: number): string[] {
  const fastMA = calculateSMA(prices, fast);
  const midMA = calculateSMA(prices, mid);
  const slowMA = calculateSMA(prices, slow);
  const signals: string[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (fastMA[i] === null || midMA[i] === null || slowMA[i] === null) { signals.push(''); continue; }
    if (fastMA[i]! > midMA[i]! && midMA[i]! > slowMA[i]!) signals.push('strong_buy');
    else if (fastMA[i]! > slowMA[i]!) signals.push('buy');
    else if (fastMA[i]! < midMA[i]! && midMA[i]! < slowMA[i]!) signals.push('strong_sell');
    else if (fastMA[i]! < slowMA[i]!) signals.push('sell');
    else signals.push('hold');
  }
  return signals;
}

describe('Moving Average Systems', () => {
  const testPrices = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 14, 13, 12, 11, 10, 11, 12, 13, 14, 15];

  describe('SMA', () => {
    it('should calculate correct SMA values', () => {
      const sma3 = calculateSMA([10, 20, 30, 40, 50], 3);
      expect(sma3[0]).toBeNull();
      expect(sma3[1]).toBeNull();
      expect(sma3[2]).toBe(20); // (10+20+30)/3
      expect(sma3[3]).toBe(30); // (20+30+40)/3
      expect(sma3[4]).toBe(40); // (30+40+50)/3
    });

    it('should have null for period-1 items', () => {
      const sma5 = calculateSMA(testPrices, 5);
      for (let i = 0; i < 4; i++) expect(sma5[i]).toBeNull();
      expect(sma5[4]).not.toBeNull();
    });

    it('should handle period=1 (equal to prices)', () => {
      const sma1 = calculateSMA([10, 20, 30], 1);
      expect(sma1).toEqual([10, 20, 30]);
    });

    it('should handle single value', () => {
      const sma = calculateSMA([100], 1);
      expect(sma).toEqual([100]);
    });

    it('should return all null when data shorter than period', () => {
      const sma = calculateSMA([1, 2], 5);
      expect(sma).toEqual([null, null]);
    });
  });

  describe('EMA', () => {
    it('should seed EMA from SMA of the first period', () => {
      // 生产口径：前 period-1 项 null，i=period-1 处用前 period 个值的 SMA 播种
      const ema = calculateEMA([10, 20, 30], 2);
      expect(ema[0]).toBeNull(); // 旧副本此处为 10（首价播种）
      expect(ema[1]).toBeCloseTo(15, 10); // (10+20)/2；旧副本为 16.667
      expect(ema[2]).toBeCloseTo(25, 10); // (30-15)*2/3+15
    });

    it('should have null for period-1 items', () => {
      const ema = calculateEMA(testPrices, 5);
      for (let i = 0; i < 4; i++) expect(ema[i]).toBeNull();
      expect(ema[4]).not.toBeNull();
    });

    it('should have length equal to input', () => {
      const ema = calculateEMA(testPrices, 5);
      expect(ema.length).toBe(testPrices.length);
    });

    it('should follow price trend', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ema = calculateEMA(prices, 3);
      // 生产前 period-1 项为 null，从首个有效值 i=period 起比较
      for (let i = 3; i < ema.length; i++) {
        expect(ema[i]!).toBeGreaterThanOrEqual(ema[i - 1]!);
      }
    });
  });

  describe('WMA', () => {
    it('should calculate weighted moving average', () => {
      const wma = calculateWMA([10, 20, 30], 3);
      expect(wma[0]).toBeNull();
      expect(wma[1]).toBeNull();
      // WMA(3) = (10*1 + 20*2 + 30*3) / (1+2+3) = 140/6 ≈ 23.33
      expect(wma[2]).toBeCloseTo(23.33, 1);
    });

    it('should weight recent values more', () => {
      const wma = calculateWMA([10, 10, 10, 20], 3);
      // Last 3: [10,10,20] → WMA = (10*1+10*2+20*3)/6 = 100/6 ≈ 16.67
      expect(wma[3]).toBeGreaterThan(10);
      expect(wma[3]).toBeLessThan(20);
    });
  });

  describe('Golden Cross Strategy', () => {
    it('should detect golden cross (buy signal)', () => {
      const shortMA = [null, null, 5, 6, 7, 8];
      const longMA = [null, null, 7, 7, 6, 5];
      const prices = [10, 10, 10, 10, 10, 10];
      // At index 4: shortMA[4]=7 > longMA[4]=6 and shortMA[3]=6 <= longMA[3]=7
      const result = goldenCrossStrategy(shortMA, longMA, prices);
      expect(result.signals.some(s => s.type === 'buy')).toBe(true);
    });

    it('should detect death cross (sell signal)', () => {
      const shortMA = [null, null, 8, 7, 6, 5];
      const longMA = [null, null, 5, 6, 7, 8];
      const prices = [10, 10, 10, 10, 10, 10];
      const result = goldenCrossStrategy(shortMA, longMA, prices);
      // Need to buy first before sell can trigger (since we need position=true)
      // Let's just check signals exist
      expect(result.signals).toBeDefined();
    });

    it('should return empty signals for flat MAs', () => {
      const ma = [null, null, 5, 5, 5, 5];
      const result = goldenCrossStrategy(ma, ma, [10, 10, 10, 10, 10, 10]);
      expect(result.signals).toHaveLength(0);
    });

    it('should calculate win rate', () => {
      const shortMA = [null, 5, 6, 7, 6, 5];
      const longMA = [null, 7, 6, 5, 6, 7];
      const prices = [10, 10, 11, 12, 11, 10];
      const result = goldenCrossStrategy(shortMA, longMA, prices);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it('should not double-buy when already in position', () => {
      const shortMA = [null, 5, 8, 9, 8, 9];
      const longMA = [null, 7, 6, 5, 6, 5];
      const prices = [10, 10, 10, 10, 10, 10];
      const result = goldenCrossStrategy(shortMA, longMA, prices);
      const buySignals = result.signals.filter(s => s.type === 'buy');
      // Should not have consecutive buy signals without a sell in between
      for (let i = 1; i < buySignals.length; i++) {
        const prevBuyIdx = result.signals.indexOf(buySignals[i - 1]);
        const currBuyIdx = result.signals.indexOf(buySignals[i]);
        const between = result.signals.slice(prevBuyIdx + 1, currBuyIdx);
        expect(between.some(s => s.type === 'sell')).toBe(true);
      }
    });
  });

  describe('Triple MA System', () => {
    it('should signal strong_buy when fast > mid > slow', () => {
      const prices = Array(20).fill(0).map((_, i) => i < 10 ? 10 : 10 + (i - 9));
      const signals = tripleMASystem(prices, 3, 5, 10);
      expect(signals.some(s => s === 'strong_buy')).toBe(true);
    });

    it('should signal strong_sell when fast < mid < slow', () => {
      const prices = Array(20).fill(0).map((_, i) => i < 10 ? 20 : 20 - (i - 9));
      const signals = tripleMASystem(prices, 3, 5, 10);
      expect(signals.some(s => s === 'strong_sell')).toBe(true);
    });

    it('should return empty strings for early data points', () => {
      const signals = tripleMASystem([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, 5, 8);
      expect(signals[0]).toBe('');
      expect(signals[1]).toBe('');
      expect(signals[2]).toBe('');
      expect(signals[3]).toBe('');
      expect(signals[4]).toBe('');
      expect(signals[5]).toBe('');
      expect(signals[6]).toBe('');
    });

    it('should return hold when MAs converge', () => {
      const prices = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
      const signals = tripleMASystem(prices, 2, 3, 5);
      // Flat prices → all MAs equal → hold
      expect(signals.filter(s => s === 'hold' || s === '').length).toBeGreaterThan(0);
    });
  });
});
