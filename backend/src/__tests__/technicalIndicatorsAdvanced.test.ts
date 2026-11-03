/**
 * 高级技术指标计算测试（绑定生产实现）
 *
 * 生产实现（唯一真源）：backend/src/indicators/technical.ts
 * 迁移口径：
 * - 删除全部自抄实现，直接 import calculateMA / EMA / MACD / RSI / KDJ / BollingerBands
 * - 生产预热期返回 null，数组长度恒等于输入长度（旧自抄实现返回紧凑数组，长度与下标口径均已改）
 * - 生产 MACD 字段为 { macd, signal, histogram }，HIST = MACD - Signal；
 *   旧断言的 (DIF - DEA) * 2 属于另一套绘图惯例，按生产口径改
 * - 原用例中的 Math.random 随机价格全部换成确定性序列（仓库红线：测试数据禁止随机）
 * - 未迁移部分：detectGoldenCross 为测试观测 helper，生产无金叉检测函数，
 *   该功能在生产中不存在，保留本地 helper 并在用例内注明（不虚构生产代码）
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMA,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateKDJ,
  calculateBollingerBands,
} from '../indicators/technical';

/**
 * 测试观测 helper（非生产实现，生产中不存在金叉检测函数）。
 * 输入为生产指标数组（等长、预热期为 null），跳过 null 后统计上穿点。
 */
function detectGoldenCross(short: (number | null)[], long: (number | null)[]): number[] {
  const crosses: number[] = [];
  const len = Math.min(short.length, long.length);
  for (let i = 1; i < len; i++) {
    const sPrev = short[i - 1];
    const lPrev = long[i - 1];
    const sCur = short[i];
    const lCur = long[i];
    if (sPrev === null || lPrev === null || sCur === null || lCur === null) continue;
    if (sPrev <= lPrev && sCur > lCur) crosses.push(i);
  }
  return crosses;
}

describe('Advanced Technical Indicators', () => {
  describe('MACD Calculation', () => {
    it('should calculate EMA with SMA seed and null warmup', () => {
      const data = [10, 11, 12, 13, 14, 15];
      const ema = calculateEMA(data, 3);
      expect(ema.length).toBe(data.length);
      // 生产实现：前 period-1 个点为 null，首个 EMA 为 SMA
      expect(ema[0]).toBeNull();
      expect(ema[1]).toBeNull();
      expect(ema[2]).toBe(11); // (10+11+12)/3
      expect(ema[ema.length - 1]!).toBeGreaterThan(ema[2]!);
    });

    it('should produce macd, signal, and histogram arrays', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.1) * 10);
      const { macd, signal, histogram } = calculateMACD(prices);
      expect(macd.length).toBe(prices.length);
      expect(signal.length).toBe(prices.length);
      expect(histogram.length).toBe(prices.length);
      // 预热期：12/26 EMA → MACD 首值 index 25；signal 再预热 9 根 → index 33
      expect(macd.slice(0, 25).every(v => v === null)).toBe(true);
      expect(signal.slice(0, 33).every(v => v === null)).toBe(true);
      expect(macd[25]).not.toBeNull();
      expect(signal[33]).not.toBeNull();
    });

    it('should detect golden cross (MACD crosses above signal)', () => {
      // 先跌 40 根再涨 40 根，反转后 MACD 上穿 signal
      const prices = Array.from({ length: 80 }, (_, i) =>
        i < 40 ? 100 - i * 0.8 : 68 + (i - 40) * 1.2
      );
      const { macd, signal } = calculateMACD(prices);
      const crosses = detectGoldenCross(macd, signal);
      expect(crosses).toEqual([41]);
      expect(macd[macd.length - 1]!).toBeGreaterThan(signal[signal.length - 1]!);
    });

    it('should have histogram = MACD - signal', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
      const { macd, signal, histogram } = calculateMACD(prices);
      for (let i = 0; i < histogram.length; i++) {
        if (macd[i] !== null && signal[i] !== null) {
          expect(histogram[i]).toBeCloseTo(macd[i]! - signal[i]!, 4);
        } else {
          expect(histogram[i]).toBeNull();
        }
      }
      expect(histogram.filter(v => v !== null).length).toBe(17); // 50 - 33
    });
  });

  describe('RSI Calculation', () => {
    it('should return values between 0 and 100', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.3) * 10);
      const rsi = calculateRSI(prices);
      expect(rsi.length).toBe(prices.length);
      // 前 14 根预热为 null
      expect(rsi.slice(0, 14).every(v => v === null)).toBe(true);
      const valid = rsi.filter((v): v is number => v !== null);
      expect(valid.length).toBe(16);
      valid.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
    });

    it('should be high for consistently rising prices', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const rsi = calculateRSI(prices);
      expect(rsi[rsi.length - 1]).toBeGreaterThan(70);
    });

    it('should be low for consistently falling prices', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 - i);
      const rsi = calculateRSI(prices);
      expect(rsi[rsi.length - 1]).toBeLessThan(30);
    });

    it('should be ~50 for flat prices', () => {
      // 确定性微幅波动序列，替代原 Math.random（仓库红线）
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.7) * 0.1);
      const rsi = calculateRSI(prices);
      const lastRsi = rsi[rsi.length - 1];
      expect(lastRsi).toBeGreaterThan(30);
      expect(lastRsi).toBeLessThan(70);
    });
  });

  describe('KDJ Calculation', () => {
    it('should calculate K, D, J values', () => {
      const n = 30;
      const closes = Array.from({ length: n }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
      const highs = closes.map(c => c + 2);
      const lows = closes.map(c => c - 2);
      const { k, d, j } = calculateKDJ(highs, lows, closes);
      expect(k.length).toBe(n);
      expect(d.length).toBe(k.length);
      expect(j.length).toBe(k.length);
      // 预热 8 根为 null，首个有效 bar 直接置 K=D=50（生产初始口径）
      expect(k.slice(0, 8).every(v => v === null)).toBe(true);
      expect(k[8]).toBe(50);
      expect(d[8]).toBe(50);
      expect(k.filter(v => v !== null).length).toBe(22);
    });

    it('should have J = 3K - 2D', () => {
      const n = 30;
      const closes = Array.from({ length: n }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
      const highs = closes.map(c => c + 2);
      const lows = closes.map(c => c - 2);
      const { k, d, j } = calculateKDJ(highs, lows, closes);
      for (let i = 0; i < j.length; i++) {
        if (k[i] !== null && d[i] !== null) {
          expect(j[i]).toBeCloseTo(3 * k[i]! - 2 * d[i]!, 3);
        }
      }
    });
  });

  describe('Bollinger Bands', () => {
    it('should have upper > middle > lower', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
      const { middle, upper, lower } = calculateBollingerBands(prices);
      expect(middle.length).toBe(prices.length);
      // period=20，index 0..18 为 null，从 19 开始有值
      expect(middle.slice(0, 19).every(v => v === null)).toBe(true);
      for (let i = 19; i < middle.length; i++) {
        expect(upper[i]!).toBeGreaterThan(middle[i]!);
        expect(middle[i]!).toBeGreaterThan(lower[i]!);
      }
    });

    it('should widen with high volatility', () => {
      // 确定性序列替代原 Math.random：平稳 ±0.1 vs 剧烈 ±10
      const stable = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.3) * 0.1);
      const volatile = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.7) * 10);
      const bbStable = calculateBollingerBands(stable);
      const bbVolatile = calculateBollingerBands(volatile);

      const firstValid = 19;
      const stableWidth = bbStable.upper[firstValid]! - bbStable.lower[firstValid]!;
      const volatileWidth = bbVolatile.upper[firstValid]! - bbVolatile.lower[firstValid]!;
      expect(volatileWidth).toBeGreaterThan(stableWidth);
    });
  });

  describe('Moving Average System', () => {
    it('should calculate MA5, MA10, MA20', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      const ma5 = calculateMA(prices, 5);
      const ma10 = calculateMA(prices, 10);
      const ma20 = calculateMA(prices, 20);
      // 生产返回与输入等长的数组，有效值数量 = n - period + 1
      expect(ma5.length).toBe(50);
      expect(ma10.length).toBe(50);
      expect(ma20.length).toBe(50);
      expect(ma5.filter(v => v !== null).length).toBe(46);
      expect(ma10.filter(v => v !== null).length).toBe(41);
      expect(ma20.filter(v => v !== null).length).toBe(31);
    });

    it('should detect golden cross', () => {
      const prices = Array.from({ length: 50 }, (_, i) =>
        i < 25 ? 100 - i * 0.5 : 87.5 + (i - 25) * 1
      );
      const ma5 = calculateMA(prices, 5);
      const ma20 = calculateMA(prices, 20);
      // 下跌段 MA5 在 MA20 下方，转涨后上穿；生产数组同长，直接按索引比较
      const crosses = detectGoldenCross(ma5, ma20);
      expect(crosses).toEqual([31]);
    });

    it('should have MA values close to price range', () => {
      // 确定性序列替代原 Math.random（仓库红线）
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.9) * 10);
      const ma10 = calculateMA(prices, 10);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const valid = ma10.filter((v): v is number => v !== null);
      expect(valid.length).toBe(21);
      valid.forEach(ma => {
        expect(ma).toBeGreaterThanOrEqual(min);
        expect(ma).toBeLessThanOrEqual(max);
      });
    });
  });
});
