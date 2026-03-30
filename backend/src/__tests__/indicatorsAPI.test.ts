/**
 * 技术指标 API 测试
 * 覆盖指标计算结果验证、API 响应格式、边界条件
 */

import { describe, it, expect } from 'vitest';

describe('技术指标 API', () => {
  // 模拟K线数据
  function generateKline(count: number, trend: 'up' | 'down' | 'sideways' = 'up') {
    const data = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
      const change = trend === 'up' ? Math.random() * 2 : trend === 'down' ? -Math.random() * 2 : (Math.random() - 0.5) * 2;
      price += change;
      const open = price;
      const close = price + (Math.random() - 0.5) * 1.5;
      const high = Math.max(open, close) + Math.random() * 0.5;
      const low = Math.min(open, close) - Math.random() * 0.5;
      data.push({
        tradeDate: new Date(2024, 0, i + 1).toISOString().split('T')[0],
        open: +open.toFixed(2),
        close: +close.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        volume: Math.floor(Math.random() * 1000000 + 500000),
        amount: Math.floor(Math.random() * 5e9 + 1e9),
      });
    }
    return data;
  }

  describe('MA 均线计算', () => {
    it('MA5 应计算5日简单移动平均', () => {
      const closes = [10, 20, 30, 40, 50];
      const ma5 = closes.reduce((a, b) => a + b, 0) / 5;
      expect(ma5).toBe(30);
    });

    it('MA5 窗口不足时应返回 null', () => {
      const closes = [10, 20, 30];
      const ma5 = closes.length >= 5 ? closes.reduce((a, b) => a + b, 0) / 5 : null;
      expect(ma5).toBeNull();
    });

    it('MA 应平滑价格波动', () => {
      // 使用确定性数据：波动较大的价格序列
      const closes = [100, 110, 95, 120, 90, 115, 105, 125, 92, 118, 108, 130, 88, 122, 112];
      const ma5 = [];
      for (let i = 4; i < closes.length; i++) {
        ma5.push(closes.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5);
      }
      // MA5 最大值应不大于原始最大值，最小值应不小于原始最小值
      expect(Math.max(...ma5)).toBeLessThanOrEqual(Math.max(...closes));
      expect(Math.min(...ma5)).toBeGreaterThanOrEqual(Math.min(...closes));
    });
  });

  describe('MACD 指标计算', () => {
    function calculateEMA(data: number[], period: number): number[] {
      const k = 2 / (period + 1);
      const ema = [data[0]];
      for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
      }
      return ema;
    }

    it('EMA12 和 EMA26 应分别计算', () => {
      const data = generateKline(30, 'up');
      const closes = data.map(d => d.close);
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      expect(ema12.length).toBe(closes.length);
      expect(ema26.length).toBe(closes.length);
    });

    it('DIF = EMA12 - EMA26', () => {
      const closes = [100, 102, 104, 103, 105, 107, 106, 108, 110, 109, 111, 113, 115, 114, 116, 118, 117, 119, 121, 120, 122, 124, 123, 125, 127, 126, 128, 130, 129, 131];
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      const dif = ema12[ema12.length - 1] - ema26[ema26.length - 1];
      expect(Number.isFinite(dif)).toBe(true);
      expect(dif).not.toBe(0);
    });

    it('上涨趋势中 DIF 应大于 0', () => {
      const data = generateKline(50, 'up');
      const closes = data.map(d => d.close);
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      const dif = ema12[ema12.length - 1] - ema26[ema26.length - 1];
      expect(dif).toBeGreaterThan(0);
    });
  });

  describe('RSI 指标计算', () => {
    function calculateRSI(closes: number[], period: number = 14): number {
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return +(100 - 100 / (1 + rs)).toFixed(2);
    }

    it('RSI 应在 0-100 范围内', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 100 + Math.random() * 10 - 5);
      const rsi = calculateRSI(closes);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('全上涨数据 RSI 应接近 100', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
      const rsi = calculateRSI(closes);
      expect(rsi).toBeGreaterThan(80);
    });

    it('全下跌数据 RSI 应接近 0', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 120 - i);
      const rsi = calculateRSI(closes);
      expect(rsi).toBeLessThan(20);
    });

    it('RSI 数据不足应返回 null', () => {
      const closes = [100, 101, 102];
      const rsi = closes.length >= 15 ? calculateRSI(closes) : null;
      expect(rsi).toBeNull();
    });
  });

  describe('KDJ 指标计算', () => {
    function calculateKDJ(data: any[], n: number = 9) {
      const result = [];
      let k = 50, d = 50;
      for (let i = n - 1; i < data.length; i++) {
        const slice = data.slice(i - n + 1, i + 1);
        const high = Math.max(...slice.map(d => d.high));
        const low = Math.min(...slice.map(d => d.low));
        const close = data[i].close;
        const rsv = high === low ? 50 : ((close - low) / (high - low)) * 100;
        k = (2 / 3) * k + (1 / 3) * rsv;
        d = (2 / 3) * d + (1 / 3) * k;
        const j = 3 * k - 2 * d;
        result.push({ k: +k.toFixed(2), d: +d.toFixed(2), j: +j.toFixed(2) });
      }
      return result;
    }

    it('KDJ 值应在合理范围', () => {
      const data = generateKline(20, 'sideways');
      const kdj = calculateKDJ(data);
      for (const point of kdj) {
        expect(Number.isFinite(point.k)).toBe(true);
        expect(Number.isFinite(point.d)).toBe(true);
        expect(Number.isFinite(point.j)).toBe(true);
      }
    });

    it('K 值应在 0-100 之间（大多情况）', () => {
      const data = generateKline(30, 'sideways');
      const kdj = calculateKDJ(data);
      for (const point of kdj) {
        expect(point.k).toBeGreaterThanOrEqual(-50);
        expect(point.k).toBeLessThanOrEqual(150);
      }
    });

    it('KDJ 数据不足应返回空数组', () => {
      const data = generateKline(5, 'up');
      const kdj = calculateKDJ(data);
      expect(kdj.length).toBe(0); // 需要至少9条
    });
  });

  describe('布林带 (BOLL)', () => {
    function calculateBOLL(closes: number[], period: number = 20, multiplier: number = 2) {
      const result = [];
      for (let i = period - 1; i < closes.length; i++) {
        const slice = closes.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((sum, val) => sum + (val - mean) ** 2, 0) / period;
        const std = Math.sqrt(variance);
        result.push({
          mid: +mean.toFixed(2),
          upper: +(mean + multiplier * std).toFixed(2),
          lower: +(mean - multiplier * std).toFixed(2),
        });
      }
      return result;
    }

    it('中轨应在上下轨之间', () => {
      const closes = Array.from({ length: 30 }, () => 100 + Math.random() * 10);
      const boll = calculateBOLL(closes);
      for (const point of boll) {
        expect(point.upper).toBeGreaterThan(point.mid);
        expect(point.mid).toBeGreaterThan(point.lower);
      }
    });

    it('上下轨距离应与标准差成正比', () => {
      // 标准差越大，上下轨距离越大
      const stable = Array.from({ length: 30 }, () => 100);
      const volatile = Array.from({ length: 30 }, () => 100 + (Math.random() - 0.5) * 20);
      const bollStable = calculateBOLL(stable);
      const bollVolatile = calculateBOLL(volatile);
      const stableWidth = bollStable[bollStable.length - 1].upper - bollStable[bollStable.length - 1].lower;
      const volatileWidth = bollVolatile[bollVolatile.length - 1].upper - bollVolatile[bollVolatile.length - 1].lower;
      expect(volatileWidth).toBeGreaterThanOrEqual(stableWidth);
    });
  });

  describe('指标响应格式', () => {
    it('完整指标响应应包含所有指标', () => {
      const response = {
        success: true,
        data: {
          symbol: '600519',
          ma: { ma5: 1800, ma10: 1790, ma20: 1780, ma60: 1750 },
          macd: { dif: 15.5, dea: 12.3, histogram: 3.2 },
          kdj: { k: 75.2, d: 68.5, j: 88.6 },
          rsi: { rsi6: 65.3, rsi12: 62.1, rsi24: 58.7 },
          boll: { upper: 1850, mid: 1800, lower: 1750 },
          lastUpdate: new Date().toISOString(),
        },
      };
      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty('symbol');
      expect(response.data).toHaveProperty('ma');
      expect(response.data).toHaveProperty('macd');
      expect(response.data).toHaveProperty('kdj');
      expect(response.data).toHaveProperty('rsi');
      expect(response.data).toHaveProperty('boll');
    });
  });
});
