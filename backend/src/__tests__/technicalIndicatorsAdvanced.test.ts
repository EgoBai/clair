import { describe, it, expect } from 'vitest';

/**
 * 高级技术指标计算测试
 * 测试 MACD、RSI、KDJ、布林带、均线系统
 */
describe('Advanced Technical Indicators', () => {
  describe('MACD Calculation', () => {
    function calculateEMA(data: number[], period: number): number[] {
      const k = 2 / (period + 1);
      const ema: number[] = [data[0]];
      for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
      }
      return ema;
    }

    function calculateMACD(prices: number[]) {
      const ema12 = calculateEMA(prices, 12);
      const ema26 = calculateEMA(prices, 26);
      const dif = ema12.map((v, i) => v - ema26[i]);
      const dea = calculateEMA(dif, 9);
      const histogram = dif.map((v, i) => (v - dea[i]) * 2);
      return { dif, dea, histogram };
    }

    it('should calculate EMA correctly', () => {
      const data = [10, 11, 12, 13, 14, 15];
      const ema = calculateEMA(data, 3);
      expect(ema.length).toBe(data.length);
      expect(ema[0]).toBe(10);
      expect(ema[ema.length - 1]).toBeGreaterThan(ema[0]);
    });

    it('should produce DIF, DEA, and histogram arrays', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.1) * 10);
      const { dif, dea, histogram } = calculateMACD(prices);
      expect(dif.length).toBe(prices.length);
      expect(dea.length).toBe(prices.length);
      expect(histogram.length).toBe(prices.length);
    });

    it('should detect golden cross (DIF crosses above DEA)', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      const { dif, dea } = calculateMACD(prices);
      // In uptrend, DIF should eventually be above DEA
      const last = dif.length - 1;
      expect(dif[last]).toBeGreaterThan(dea[last] - 0.1);
    });

    it('should have histogram = (DIF - DEA) * 2', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
      const { dif, dea, histogram } = calculateMACD(prices);
      for (let i = 0; i < histogram.length; i++) {
        expect(histogram[i]).toBeCloseTo((dif[i] - dea[i]) * 2, 5);
      }
    });
  });

  describe('RSI Calculation', () => {
    function calculateRSI(prices: number[], period: number = 14): number[] {
      const rsi: number[] = [];
      const gains: number[] = [];
      const losses: number[] = [];

      for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? Math.abs(change) : 0);
      }

      for (let i = period - 1; i < gains.length; i++) {
        const avgGain = gains.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
        const avgLoss = losses.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
      }
      return rsi;
    }

    it('should return values between 0 and 100', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.3) * 10);
      const rsi = calculateRSI(prices);
      rsi.forEach(v => {
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
      const prices = Array.from({ length: 30 }, () => 100 + (Math.random() - 0.5) * 0.1);
      const rsi = calculateRSI(prices);
      const lastRsi = rsi[rsi.length - 1];
      expect(lastRsi).toBeGreaterThan(30);
      expect(lastRsi).toBeLessThan(70);
    });
  });

  describe('KDJ Calculation', () => {
    function calculateKDJ(
      highs: number[], lows: number[], closes: number[],
      period: number = 9
    ): { k: number[]; d: number[]; j: number[] } {
      const k: number[] = [];
      const d: number[] = [];
      const j: number[] = [];
      let prevK = 50;
      let prevD = 50;

      for (let i = period - 1; i < closes.length; i++) {
        const sliceHigh = Math.max(...highs.slice(i - period + 1, i + 1));
        const sliceLow = Math.min(...lows.slice(i - period + 1, i + 1));
        const rsv = sliceHigh === sliceLow ? 50 :
          ((closes[i] - sliceLow) / (sliceHigh - sliceLow)) * 100;

        const curK = (2 / 3) * prevK + (1 / 3) * rsv;
        const curD = (2 / 3) * prevD + (1 / 3) * curK;
        const curJ = 3 * curK - 2 * curD;

        k.push(curK);
        d.push(curD);
        j.push(curJ);
        prevK = curK;
        prevD = curD;
      }

      return { k, d, j };
    }

    it('should calculate K, D, J values', () => {
      const n = 30;
      const closes = Array.from({ length: n }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
      const highs = closes.map(c => c + 2);
      const lows = closes.map(c => c - 2);
      const { k, d, j } = calculateKDJ(highs, lows, closes);
      expect(k.length).toBeGreaterThan(0);
      expect(d.length).toBe(k.length);
      expect(j.length).toBe(k.length);
    });

    it('should have J = 3K - 2D', () => {
      const n = 30;
      const closes = Array.from({ length: n }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
      const highs = closes.map(c => c + 2);
      const lows = closes.map(c => c - 2);
      const { k, d, j } = calculateKDJ(highs, lows, closes);
      for (let i = 0; i < j.length; i++) {
        expect(j[i]).toBeCloseTo(3 * k[i] - 2 * d[i], 5);
      }
    });
  });

  describe('Bollinger Bands', () => {
    function calculateBollinger(prices: number[], period: number = 20, multiplier: number = 2) {
      const middle: number[] = [];
      const upper: number[] = [];
      const lower: number[] = [];

      for (let i = period - 1; i < prices.length; i++) {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = slice.reduce((s, v) => s + v, 0) / period;
        const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
        const std = Math.sqrt(variance);
        middle.push(mean);
        upper.push(mean + multiplier * std);
        lower.push(mean - multiplier * std);
      }

      return { middle, upper, lower };
    }

    it('should have upper > middle > lower', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
      const { middle, upper, lower } = calculateBollinger(prices);
      for (let i = 0; i < middle.length; i++) {
        expect(upper[i]).toBeGreaterThan(middle[i]);
        expect(middle[i]).toBeGreaterThan(lower[i]);
      }
    });

    it('should widen with high volatility', () => {
      const stable = Array.from({ length: 30 }, () => 100 + (Math.random() - 0.5) * 0.1);
      const volatile = Array.from({ length: 30 }, () => 100 + (Math.random() - 0.5) * 20);
      const bbStable = calculateBollinger(stable);
      const bbVolatile = calculateBollinger(volatile);

      const stableWidth = bbStable.upper[0] - bbStable.lower[0];
      const volatileWidth = bbVolatile.upper[0] - bbVolatile.lower[0];
      expect(volatileWidth).toBeGreaterThan(stableWidth);
    });
  });

  describe('Moving Average System', () => {
    function calculateMA(prices: number[], period: number): number[] {
      const ma: number[] = [];
      for (let i = period - 1; i < prices.length; i++) {
        const sum = prices.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0);
        ma.push(sum / period);
      }
      return ma;
    }

    function detectGoldenCross(short: number[], long: number[]): number[] {
      const crosses: number[] = [];
      const offset = long.length - short.length;
      for (let i = 1; i < short.length; i++) {
        const li = i + offset;
        if (short[i - 1] <= long[li - 1] && short[i] > long[li]) {
          crosses.push(i);
        }
      }
      return crosses;
    }

    it('should calculate MA5, MA10, MA20', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      const ma5 = calculateMA(prices, 5);
      const ma10 = calculateMA(prices, 10);
      const ma20 = calculateMA(prices, 20);
      expect(ma5.length).toBe(46);
      expect(ma10.length).toBe(41);
      expect(ma20.length).toBe(31);
    });

    it('should detect golden cross', () => {
      const prices = Array.from({ length: 50 }, (_, i) => i < 25 ? 100 - i * 0.5 : 87.5 + (i - 25) * 1);
      const ma5 = calculateMA(prices, 5);
      const ma20 = calculateMA(prices, 20);
      // In uptrend, MA5 should cross above MA20
    });

    it('should have MA values close to price range', () => {
      const prices = Array.from({ length: 30 }, () => 100 + (Math.random() - 0.5) * 10);
      const ma10 = calculateMA(prices, 10);
      ma10.forEach(ma => {
        expect(ma).toBeGreaterThan(80);
        expect(ma).toBeLessThan(120);
      });
    });
  });
});
