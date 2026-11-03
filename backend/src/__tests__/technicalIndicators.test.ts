/**
 * 技术指标计算模块测试（绑定生产实现）
 *
 * 生产实现（唯一真源）：backend/src/indicators/technical.ts
 * 本文件不再保留任何自抄实现，断言口径以生产实际行为为准：
 * - 预热期返回 null，数组长度恒等于输入长度（不补 0、不跳过）
 * - MACD 返回 { macd, signal, histogram }，HIST = MACD - Signal
 * - RSI 使用 Wilder 平滑，首个 RSI 位于 index = period
 * - KDJ 入参为 high[] / low[] / close[]，首个有效 bar 直接置 K=D=50
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
import type { OHLCV } from '../indicators/technical';

describe('技术指标计算', () => {
  const prices = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20, 19, 21, 22, 21, 23];

  describe('calculateMA', () => {
    it('should return null for insufficient data', () => {
      const ma = calculateMA([1, 2], 5);
      expect(ma).toEqual([null, null]);
    });

    it('should calculate MA correctly', () => {
      const ma = calculateMA([10, 20, 30, 40, 50], 3);
      expect(ma[0]).toBeNull();
      expect(ma[1]).toBeNull();
      expect(ma[2]).toBe(20); // (10+20+30)/3
      expect(ma[3]).toBe(30); // (20+30+40)/3
      expect(ma[4]).toBe(40); // (30+40+50)/3
    });

    it('should have correct length', () => {
      const ma = calculateMA(prices, 5);
      expect(ma.length).toBe(prices.length);
    });

    it('should calculate MA5 from real data', () => {
      const ma = calculateMA(prices, 5);
      // First 4 should be null
      for (let i = 0; i < 4; i++) expect(ma[i]).toBeNull();
      // 5th: (10+11+12+11+13)/5 = 11.4
      expect(ma[4]).toBe(11.4);
    });
  });

  describe('calculateEMA', () => {
    it('should return null for insufficient data', () => {
      const ema = calculateEMA([1, 2], 3);
      expect(ema).toEqual([null, null]);
    });

    it('should use SMA for first EMA value', () => {
      const ema = calculateEMA([10, 20, 30], 3);
      expect(ema[2]).toBe(20); // (10+20+30)/3
    });

    it('should calculate subsequent EMA values', () => {
      const ema = calculateEMA([10, 20, 30, 40], 3);
      expect(ema[2]).toBe(20);
      // EMA[3] = (40-20) * (2/4) + 20 = 10 + 20 = 30
      expect(ema[3]).toBe(30);
    });
  });

  describe('calculateMACD', () => {
    it('should return nulls for insufficient data', () => {
      const macd = calculateMACD([1, 2, 3], 12, 26, 9);
      expect(macd.macd.every(v => v === null)).toBe(true);
      expect(macd.signal.every(v => v === null)).toBe(true);
      expect(macd.histogram.every(v => v === null)).toBe(true);
    });

    it('should have correct structure', () => {
      const macd = calculateMACD(prices, 3, 5, 3);
      expect(macd.macd.length).toBe(prices.length);
      expect(macd.signal.length).toBe(prices.length);
      expect(macd.histogram.length).toBe(prices.length);
      // MACD 预热到 longPeriod-1，signal 再预热 signalPeriod-1（生产行为）
      expect(macd.macd.slice(0, 4).every(v => v === null)).toBe(true);
      expect(macd.signal.slice(0, 6).every(v => v === null)).toBe(true);
    });

    it('histogram should equal macd minus signal', () => {
      const macd = calculateMACD(prices, 3, 5, 3);
      for (let i = 0; i < prices.length; i++) {
        if (macd.macd[i] !== null && macd.signal[i] !== null) {
          expect(macd.histogram[i]).toBeCloseTo(macd.macd[i]! - macd.signal[i]!, 4);
        } else {
          expect(macd.histogram[i]).toBeNull();
        }
      }
    });
  });

  describe('calculateRSI', () => {
    it('should return null for insufficient data', () => {
      const rsi = calculateRSI([1, 2, 3], 14);
      expect(rsi.every(v => v === null)).toBe(true);
    });

    it('should return 100 when no losses', () => {
      const rising = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
      const rsi = calculateRSI(rising, 14);
      expect(rsi[14]).toBe(100);
    });

    it('should be between 0 and 100', () => {
      const rsi = calculateRSI(prices, 5);
      for (const v of rsi) {
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    });

    it('should use Wilder smoothing after the first RSI', () => {
      // 前 5 根预热为 null；index 5 首个 RSI = 83.3333（5 涨 1 跌）
      const rsi = calculateRSI(prices, 5);
      expect(rsi.slice(0, 5).every(v => v === null)).toBe(true);
      expect(rsi[5]).toBeCloseTo(83.3333, 4);
      // index 6 用 Wilder 平滑 = 68.9655；若仍用简单滚动窗口则为 66.6667
      expect(rsi[6]).toBeCloseTo(68.9655, 4);
    });
  });

  describe('calculateKDJ', () => {
    const ohlcv: OHLCV[] = prices.map((close, i) => ({
      tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: close - 0.5,
      close,
      high: close + 1,
      low: close - 1,
      volume: 1000000,
    }));
    const highs = ohlcv.map(d => d.high);
    const lows = ohlcv.map(d => d.low);
    const closes = ohlcv.map(d => d.close);

    it('should return nulls for insufficient data', () => {
      const kdj = calculateKDJ(highs.slice(0, 3), lows.slice(0, 3), closes.slice(0, 3), 9);
      expect(kdj.k.every(v => v === null)).toBe(true);
      expect(kdj.d.every(v => v === null)).toBe(true);
      expect(kdj.j.every(v => v === null)).toBe(true);
    });

    it('should have K, D, J arrays of correct length', () => {
      const kdj = calculateKDJ(highs, lows, closes, 5);
      expect(kdj.k.length).toBe(ohlcv.length);
      expect(kdj.d.length).toBe(ohlcv.length);
      expect(kdj.j.length).toBe(ohlcv.length);
      // 生产实现首个有效 bar 直接置 50（旧自抄实现的 2/3*50 + 1/3*RSV 口径不同）
      expect(kdj.k[4]).toBe(50);
      expect(kdj.d[4]).toBe(50);
    });

    it('J should equal 3K - 2D', () => {
      const kdj = calculateKDJ(highs, lows, closes, 5);
      for (let i = 0; i < ohlcv.length; i++) {
        if (kdj.k[i] !== null && kdj.d[i] !== null) {
          expect(kdj.j[i]).toBeCloseTo(3 * kdj.k[i]! - 2 * kdj.d[i]!, 3);
        }
      }
    });
  });

  describe('calculateBollingerBands', () => {
    it('should return nulls for insufficient data', () => {
      const boll = calculateBollingerBands([1, 2, 3], 20);
      expect(boll.upper.every(v => v === null)).toBe(true);
      expect(boll.middle.every(v => v === null)).toBe(true);
      expect(boll.lower.every(v => v === null)).toBe(true);
    });

    it('upper should be above middle, lower below', () => {
      const boll = calculateBollingerBands(prices, 5);
      for (let i = 0; i < prices.length; i++) {
        if (boll.middle[i] !== null) {
          expect(boll.upper[i]!).toBeGreaterThan(boll.middle[i]!);
          expect(boll.lower[i]!).toBeLessThan(boll.middle[i]!);
        }
      }
    });

    it('middle should equal MA', () => {
      const boll = calculateBollingerBands(prices, 5);
      const ma = calculateMA(prices, 5);
      for (let i = 0; i < prices.length; i++) {
        expect(boll.middle[i]).toBe(ma[i]);
      }
    });
  });
});
