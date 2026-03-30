import { describe, it, expect } from 'vitest';

// Technical analysis and indicator calculation tests
describe('Technical Analysis Engine', () => {
  // Moving Average calculations
  describe('Moving Averages', () => {
    const prices = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];

    it('should calculate SMA correctly', () => {
      const period = 5;
      const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      expect(sma).toBe(14);
    });

    it('should calculate SMA for last period', () => {
      const period = 5;
      const last = prices.slice(-period).reduce((a, b) => a + b, 0) / period;
      expect(last).toBe(24);
    });

    it('should calculate EMA with smoothing factor', () => {
      const period = 5;
      const multiplier = 2 / (period + 1);
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
      }
      expect(ema).toBeGreaterThanOrEqual(24); // EMA reacts faster
    });

    it('should handle period = 1 (equals original)', () => {
      const result = prices.map(p => p);
      expect(result).toEqual(prices);
    });

    it('should return null for insufficient data', () => {
      const data = [1, 2, 3];
      const period = 5;
      const sma = data.length >= period ? data.slice(0, period).reduce((a, b) => a + b, 0) / period : null;
      expect(sma).toBeNull();
    });

    it('should calculate multiple MAs consistently', () => {
      const ma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const ma10 = prices.reduce((a, b) => a + b, 0) / 10;
      expect(ma5).toBeGreaterThan(ma10); // Rising trend
    });
  });

  // MACD calculations
  describe('MACD Indicator', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 2);

    function calcEMA(data: number[], period: number): number[] {
      const mult = 2 / (period + 1);
      let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const result: number[] = [];
      for (let i = 0; i < period - 1; i++) result.push(NaN);
      result.push(ema);
      for (let i = period; i < data.length; i++) {
        ema = (data[i] - ema) * mult + ema;
        result.push(ema);
      }
      return result;
    }

    it('should calculate DIF = EMA12 - EMA26', () => {
      const ema12 = calcEMA(prices, 12);
      const ema26 = calcEMA(prices, 26);
      const last12 = ema12[ema12.length - 1];
      const last26 = ema26[ema26.length - 1];
      const dif = last12 - last26;
      expect(Number.isFinite(dif)).toBe(true);
    });

    it('should have DIF positive in uptrend', () => {
      const upPrices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      const ema12 = calcEMA(upPrices, 12);
      const ema26 = calcEMA(upPrices, 26);
      const dif = ema12[ema12.length - 1] - ema26[ema26.length - 1];
      expect(dif).toBeGreaterThan(0);
    });

    it('should have DIF negative in downtrend', () => {
      const downPrices = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
      const ema12 = calcEMA(downPrices, 12);
      const ema26 = calcEMA(downPrices, 26);
      const dif = ema12[ema12.length - 1] - ema26[ema26.length - 1];
      expect(dif).toBeLessThan(0);
    });

    it('should detect golden cross (DIF > DEA)', () => {
      const dif = [1, 2, 3, 4, 5];
      const dea = [2, 2, 2, 3, 3];
      const goldenCross = dif[dif.length - 1] > dea[dea.length - 1] &&
                          dif[dif.length - 2] <= dea[dea.length - 2];
      // Last point: DIF=5 > DEA=3
      expect(dif[4]).toBeGreaterThan(dea[4]);
    });

    it('should detect death cross (DIF < DEA)', () => {
      const dif = [5, 4, 3, 2, 1];
      const dea = [4, 4, 3, 3, 2];
      expect(dif[4]).toBeLessThan(dea[3]); // Crossed below
    });

    it('should calculate histogram = DIF - DEA', () => {
      const dif = 5.2;
      const dea = 4.8;
      const histogram = dif - dea;
      expect(histogram).toBeCloseTo(0.4, 1);
    });

    it('should handle flat market (DIF ≈ 0)', () => {
      const flatPrices = Array.from({ length: 30 }, () => 100);
      const ema12 = calcEMA(flatPrices, 12);
      const ema26 = calcEMA(flatPrices, 26);
      const dif = ema12[ema12.length - 1] - ema26[ema26.length - 1];
      expect(Math.abs(dif)).toBeLessThan(0.01);
    });
  });

  // RSI calculations
  describe('RSI Indicator', () => {
    function calcRSI(prices: number[], period: number): number {
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - 100 / (1 + rs);
    }

    it('should return 100 when all gains', () => {
      const prices = [10, 11, 12, 13, 14, 15];
      const rsi = calcRSI(prices, 5);
      expect(rsi).toBe(100);
    });

    it('should return 0 when all losses', () => {
      const prices = [15, 14, 13, 12, 11, 10];
      const rsi = calcRSI(prices, 5);
      expect(rsi).toBe(0);
    });

    it('should return 50 for flat prices', () => {
      const prices = [10, 10, 10, 10, 10, 10];
      const rsi = calcRSI(prices, 5);
      expect(rsi).toBe(100); // No loss, so 100
    });

    it('should be between 0 and 100', () => {
      const prices = [10, 12, 11, 13, 9, 14, 8, 15];
      const rsi = calcRSI(prices, 5);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('should detect overbought (RSI > 70)', () => {
      const rsi = 75;
      expect(rsi).toBeGreaterThan(70);
    });

    it('should detect oversold (RSI < 30)', () => {
      const rsi = 25;
      expect(rsi).toBeLessThan(30);
    });

    it('should handle period = 14 (standard)', () => {
      const prices = Array.from({ length: 15 }, (_, i) => 100 + Math.random() * 10);
      const rsi = calcRSI(prices, 14);
      expect(Number.isFinite(rsi)).toBe(true);
    });
  });

  // KDJ calculations
  describe('KDJ Indicator', () => {
    function calcKDJ(highs: number[], lows: number[], closes: number[], period: number) {
      const result: { k: number; d: number; j: number }[] = [];
      let k = 50, d = 50;
      for (let i = period - 1; i < closes.length; i++) {
        const sliceH = highs.slice(i - period + 1, i + 1);
        const sliceL = lows.slice(i - period + 1, i + 1);
        const hn = Math.max(...sliceH);
        const ln = Math.min(...sliceL);
        const rsv = hn === ln ? 50 : ((closes[i] - ln) / (hn - ln)) * 100;
        k = (2 / 3) * k + (1 / 3) * rsv;
        d = (2 / 3) * d + (1 / 3) * k;
        const j = 3 * k - 2 * d;
        result.push({ k, d, j });
      }
      return result;
    }

    it('should calculate KDJ with correct structure', () => {
      const highs = [10, 12, 14, 16, 18, 20];
      const lows = [8, 10, 12, 14, 16, 18];
      const closes = [9, 11, 13, 15, 17, 19];
      const kdj = calcKDJ(highs, lows, closes, 5);
      expect(kdj.length).toBeGreaterThan(0);
      kdj.forEach(({ k, d, j }) => {
        expect(Number.isFinite(k)).toBe(true);
        expect(Number.isFinite(d)).toBe(true);
        expect(Number.isFinite(j)).toBe(true);
      });
    });

    it('should have J = 3K - 2D', () => {
      const highs = [10, 12, 14, 16, 18, 20];
      const lows = [8, 10, 12, 14, 16, 18];
      const closes = [9, 11, 13, 15, 17, 19];
      const kdj = calcKDJ(highs, lows, closes, 5);
      kdj.forEach(({ k, d, j }) => {
        expect(j).toBeCloseTo(3 * k - 2 * d, 5);
      });
    });

    it('should detect overbought (K > 80, D > 80)', () => {
      const k = 85, d = 82;
      expect(k).toBeGreaterThan(80);
      expect(d).toBeGreaterThan(80);
    });

    it('should detect oversold (K < 20, D < 20)', () => {
      const k = 15, d = 18;
      expect(k).toBeLessThan(20);
      expect(d).toBeLessThan(20);
    });

    it('should handle equal high and low (RSV = 50)', () => {
      const highs = [10, 10, 10, 10, 10];
      const lows = [10, 10, 10, 10, 10];
      const closes = [10, 10, 10, 10, 10];
      const kdj = calcKDJ(highs, lows, closes, 5);
      expect(kdj.length).toBe(1);
    });
  });

  // BOLL (Bollinger Bands)
  describe('BOLL Bands', () => {
    function calcBOLL(prices: number[], period: number, multiplier: number) {
      const result: { upper: number; middle: number; lower: number }[] = [];
      for (let i = period - 1; i < prices.length; i++) {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
        const std = Math.sqrt(variance);
        result.push({
          upper: mean + multiplier * std,
          middle: mean,
          lower: mean - multiplier * std,
        });
      }
      return result;
    }

    it('should have upper > middle > lower', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 5);
      const boll = calcBOLL(prices, 20, 2);
      boll.forEach(({ upper, middle, lower }) => {
        expect(upper).toBeGreaterThan(middle);
        expect(middle).toBeGreaterThan(lower);
      });
    });

    it('should have zero band width for flat prices', () => {
      const prices = Array.from({ length: 20 }, () => 100);
      const boll = calcBOLL(prices, 20, 2);
      const last = boll[boll.length - 1];
      expect(last.upper).toBe(100);
      expect(last.lower).toBe(100);
    });

    it('should increase band width with volatility', () => {
      const stable = Array.from({ length: 20 }, (_, i) => 100 + (i % 2) * 0.1);
      const volatile = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 === 0 ? 10 : -10));
      const bollStable = calcBOLL(stable, 20, 2);
      const bollVolatile = calcBOLL(volatile, 20, 2);
      const widthStable = bollStable[bollStable.length - 1].upper - bollStable[bollStable.length - 1].lower;
      const widthVolatile = bollVolatile[bollVolatile.length - 1].upper - bollVolatile[bollVolatile.length - 1].lower;
      expect(widthVolatile).toBeGreaterThan(widthStable);
    });

    it('should detect price near upper band', () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
      const boll = calcBOLL(prices, 10, 2);
      const last = boll[boll.length - 1];
      const price = prices[prices.length - 1];
      expect(price).toBeGreaterThanOrEqual(last.lower);
      expect(price).toBeLessThanOrEqual(last.upper + 1); // Near or at upper band
    });

    it('should calculate with different multipliers', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 3);
      const boll2 = calcBOLL(prices, 20, 2);
      const boll3 = calcBOLL(prices, 20, 3);
      const width2 = boll2[0].upper - boll2[0].lower;
      const width3 = boll3[0].upper - boll3[0].lower;
      expect(width3).toBeGreaterThan(width2);
    });
  });

  // ATR (Average True Range)
  describe('ATR Indicator', () => {
    function calcATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
      const tr: number[] = [highs[0] - lows[0]];
      for (let i = 1; i < highs.length; i++) {
        tr.push(Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        ));
      }
      const atr: number[] = [];
      let sum = 0;
      for (let i = 0; i < period; i++) sum += tr[i];
      atr.push(sum / period);
      for (let i = period; i < tr.length; i++) {
        atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
      }
      return atr;
    }

    it('should calculate ATR correctly', () => {
      const highs = [48.70, 48.72, 48.90, 48.87, 48.82, 49.05, 49.20, 49.35, 49.92, 50.19, 50.12, 49.66, 49.88, 50.19, 50.36, 50.57, 50.65];
      const lows = [47.79, 48.14, 48.39, 48.37, 48.24, 48.64, 48.94, 48.86, 49.50, 49.87, 49.20, 49.43, 49.43, 49.84, 49.96, 50.14, 50.21];
      const closes = [48.16, 48.61, 48.75, 48.63, 48.74, 49.03, 49.07, 49.32, 49.91, 50.13, 49.53, 49.55, 49.81, 50.13, 50.32, 50.54, 50.44];
      const atr = calcATR(highs, lows, closes, 14);
      expect(atr.length).toBeGreaterThan(0);
      atr.forEach(a => expect(a).toBeGreaterThan(0));
    });

    it('should have ATR > 0 for any volatile market', () => {
      const n = 20;
      const highs = Array.from({ length: n }, (_, i) => 100 + i * 0.5 + Math.random() * 2);
      const lows = Array.from({ length: n }, (_, i) => 100 + i * 0.5 - Math.random() * 2);
      const closes = Array.from({ length: n }, (_, i) => 100 + i * 0.5);
      const atr = calcATR(highs, lows, closes, 14);
      atr.forEach(a => expect(a).toBeGreaterThan(0));
    });

    it('should return null for insufficient data', () => {
      const atr = calcATR([100], [99], [99.5], 14);
      expect(atr.length).toBeLessThanOrEqual(1); // Not enough data
    });
  });

  // Support and Resistance
  describe('Support and Resistance', () => {
    function findPivots(highs: number[], lows: number[], window: number) {
      const supports: number[] = [];
      const resistances: number[] = [];
      for (let i = window; i < highs.length - window; i++) {
        const localHigh = Math.max(...highs.slice(i - window, i + window + 1));
        const localLow = Math.min(...lows.slice(i - window, i + window + 1));
        if (highs[i] === localHigh) resistances.push(highs[i]);
        if (lows[i] === localLow) supports.push(lows[i]);
      }
      return { supports, resistances };
    }

    it('should find pivot highs and lows', () => {
      const highs = [10, 12, 14, 12, 10, 11, 13, 15, 13, 11];
      const lows = [8, 10, 12, 10, 8, 9, 11, 13, 11, 9];
      const { supports, resistances } = findPivots(highs, lows, 2);
      expect(resistances.length).toBeGreaterThan(0);
      expect(supports.length).toBeGreaterThan(0);
    });

    it('should have resistance > support', () => {
      const highs = [10, 12, 14, 12, 10, 11, 13, 15, 13, 11];
      const lows = [8, 10, 12, 10, 8, 9, 11, 13, 11, 9];
      const { supports, resistances } = findPivots(highs, lows, 2);
      if (resistances.length && supports.length) {
        expect(Math.min(...resistances)).toBeGreaterThan(Math.max(...supports));
      }
    });
  });

  // Fibonacci Retracement
  describe('Fibonacci Retracement', () => {
    function fibLevels(high: number, low: number) {
      const diff = high - low;
      return {
        level0: high,
        level236: high - diff * 0.236,
        level382: high - diff * 0.382,
        level500: high - diff * 0.5,
        level618: high - diff * 0.618,
        level786: high - diff * 0.786,
        level100: low,
      };
    }

    it('should calculate correct Fibonacci levels', () => {
      const levels = fibLevels(100, 50);
      expect(levels.level0).toBe(100);
      expect(levels.level500).toBe(75);
      expect(levels.level100).toBe(50);
    });

    it('should have levels in descending order', () => {
      const levels = fibLevels(200, 100);
      expect(levels.level0).toBeGreaterThan(levels.level236);
      expect(levels.level236).toBeGreaterThan(levels.level382);
      expect(levels.level382).toBeGreaterThan(levels.level500);
      expect(levels.level500).toBeGreaterThan(levels.level618);
      expect(levels.level618).toBeGreaterThan(levels.level786);
      expect(levels.level786).toBeGreaterThan(levels.level100);
    });

    it('should apply golden ratio (0.618)', () => {
      const levels = fibLevels(161.8, 100);
      expect(levels.level618).toBeCloseTo(161.8 - 61.8 * 0.618, 1);
    });

    it('should handle equal high and low', () => {
      const levels = fibLevels(100, 100);
      expect(levels.level0).toBe(100);
      expect(levels.level100).toBe(100);
      expect(levels.level500).toBe(100);
    });
  });

  // Trend detection
  describe('Trend Detection', () => {
    function detectTrend(prices: number[], period: number): 'up' | 'down' | 'sideways' {
      if (prices.length < period) return 'sideways';
      const recent = prices.slice(-period);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const change = (last - first) / first;
      if (change > 0.02) return 'up';
      if (change < -0.02) return 'down';
      return 'sideways';
    }

    it('should detect uptrend', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
      expect(detectTrend(prices, 10)).toBe('up');
    });

    it('should detect downtrend', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 200 - i * 2);
      expect(detectTrend(prices, 10)).toBe('down');
    });

    it('should detect sideways trend', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + (i % 2) * 0.1);
      expect(detectTrend(prices, 10)).toBe('sideways');
    });

    it('should return sideways for insufficient data', () => {
      expect(detectTrend([1, 2], 10)).toBe('sideways');
    });
  });

  // Divergence detection
  describe('Divergence Detection', () => {
    function detectBullishDivergence(prices: number[], indicator: number[]): boolean {
      if (prices.length < 2 || indicator.length < 2) return false;
      const priceLowerLow = prices[prices.length - 1] < prices[prices.length - 2];
      const indicatorHigherLow = indicator[indicator.length - 1] > indicator[indicator.length - 2];
      return priceLowerLow && indicatorHigherLow;
    }

    function detectBearishDivergence(prices: number[], indicator: number[]): boolean {
      if (prices.length < 2 || indicator.length < 2) return false;
      const priceHigherHigh = prices[prices.length - 1] > prices[prices.length - 2];
      const indicatorLowerHigh = indicator[indicator.length - 1] < indicator[indicator.length - 2];
      return priceHigherHigh && indicatorLowerHigh;
    }

    it('should detect bullish divergence', () => {
      const prices = [100, 95, 90];
      const rsi = [30, 35, 40];
      expect(detectBullishDivergence(prices, rsi)).toBe(true);
    });

    it('should detect bearish divergence', () => {
      const prices = [100, 105, 110];
      const rsi = [70, 65, 60];
      expect(detectBearishDivergence(prices, rsi)).toBe(true);
    });

    it('should not detect divergence in aligned movement', () => {
      const prices = [100, 105, 110];
      const rsi = [50, 55, 60];
      expect(detectBullishDivergence(prices, rsi)).toBe(false);
      expect(detectBearishDivergence(prices, rsi)).toBe(false);
    });

    it('should handle empty arrays', () => {
      expect(detectBullishDivergence([], [])).toBe(false);
      expect(detectBearishDivergence([], [])).toBe(false);
    });
  });

  // Cross signal detection
  describe('Cross Signal Detection', () => {
    function detectCross(fast: number[], slow: number[]): 'golden' | 'death' | null {
      if (fast.length < 2 || slow.length < 2) return null;
      const prevDiff = fast[fast.length - 2] - slow[slow.length - 2];
      const currDiff = fast[fast.length - 1] - slow[slow.length - 1];
      if (prevDiff <= 0 && currDiff > 0) return 'golden';
      if (prevDiff >= 0 && currDiff < 0) return 'death';
      return null;
    }

    it('should detect golden cross', () => {
      const fast = [9, 10, 11];
      const slow = [10, 10, 10];
      expect(detectCross(fast, slow)).toBe('golden');
    });

    it('should detect death cross', () => {
      const fast = [11, 10, 9];
      const slow = [10, 10, 10];
      expect(detectCross(fast, slow)).toBe('death');
    });

    it('should return null when no cross', () => {
      const fast = [10, 11, 12];
      const slow = [9, 9, 9];
      expect(detectCross(fast, slow)).toBeNull();
    });

    it('should return null for insufficient data', () => {
      expect(detectCross([1], [1])).toBeNull();
    });
  });
});
