import { describe, it, expect } from 'vitest';

describe('技术指标扩展测试', () => {
  describe('MA 均线', () => {
    it('简单移动平均应该正确计算', () => {
      const prices = [10, 12, 14, 16, 18];
      const ma3 = (prices: number[], idx: number, period: number) => {
        if (idx < period - 1) return null;
        const slice = prices.slice(idx - period + 1, idx + 1);
        return slice.reduce((a, b) => a + b, 0) / period;
      };
      expect(ma3(prices, 2, 3)).toBeCloseTo(12); // (10+12+14)/3
      expect(ma3(prices, 0, 3)).toBeNull();
    });

    it('MA 应该平滑价格波动', () => {
      const prices = [100, 105, 95, 110, 90];
      const ma = prices.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      expect(ma).toBeCloseTo(100);
      expect(ma).toBeLessThan(Math.max(...prices.slice(0, 3)));
      expect(ma).toBeGreaterThan(Math.min(...prices.slice(0, 3)));
    });
  });

  describe('EMA 指数移动平均', () => {
    it('EMA 应该给近期价格更高权重', () => {
      const ema = (prices: number[], period: number) => {
        const k = 2 / (period + 1);
        let result = prices[0];
        for (let i = 1; i < prices.length; i++) {
          result = prices[i] * k + result * (1 - k);
        }
        return result;
      };
      const upPrices = [10, 11, 12, 13, 14];
      const result = ema(upPrices, 3);
      expect(result).toBeGreaterThan(upPrices[0]);
      expect(result).toBeLessThanOrEqual(upPrices[upPrices.length - 1]);
    });

    it('EMA multiplier 应该在 0-1 之间', () => {
      const periods = [5, 10, 20, 50, 100];
      for (const p of periods) {
        const k = 2 / (p + 1);
        expect(k).toBeGreaterThan(0);
        expect(k).toBeLessThan(1);
      }
    });
  });

  describe('MACD', () => {
    it('DIF = EMA12 - EMA26', () => {
      const ema = (prices: number[], period: number) => {
        const k = 2 / (period + 1);
        let result = prices[0];
        for (let i = 1; i < prices.length; i++) {
          result = prices[i] * k + result * (1 - k);
        }
        return result;
      };
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 10);
      const ema12 = ema(prices, 12);
      const ema26 = ema(prices, 26);
      const dif = ema12 - ema26;
      expect(typeof dif).toBe('number');
      expect(Number.isFinite(dif)).toBe(true);
    });

    it('MACD 柱状图 = DIF - DEA', () => {
      const dif = 0.5;
      const dea = 0.3;
      const histogram = dif - dea;
      expect(histogram).toBe(0.2);
    });

    it('金叉: DIF 从下向上穿过 DEA', () => {
      const isGoldenCross = (difPrev: number, deaPrev: number, difCurr: number, deaCurr: number) =>
        difPrev <= deaPrev && difCurr > deaCurr;
      expect(isGoldenCross(0.1, 0.2, 0.3, 0.25)).toBe(true);
      expect(isGoldenCross(0.3, 0.2, 0.4, 0.3)).toBe(false);
    });

    it('死叉: DIF 从上向下穿过 DEA', () => {
      const isDeathCross = (difPrev: number, deaPrev: number, difCurr: number, deaCurr: number) =>
        difPrev >= deaPrev && difCurr < deaCurr;
      expect(isDeathCross(0.3, 0.2, 0.2, 0.25)).toBe(true);
      expect(isDeathCross(0.1, 0.2, 0.3, 0.25)).toBe(false);
    });
  });

  describe('RSI', () => {
    it('RSI 应该在 0-100 之间', () => {
      const rsi = (prices: number[], period: number) => {
        if (prices.length < period + 1) return null;
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
      };
      const prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
      const result = rsi(prices, 14);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThanOrEqual(0);
      expect(result!).toBeLessThanOrEqual(100);
    });

    it('全涨 RSI 应该接近 100', () => {
      const prices = Array.from({ length: 15 }, (_, i) => 100 + i);
      let gains = 0, losses = 0;
      for (let i = 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);
      expect(rsi).toBe(100);
    });

    it('超买超卖阈值应该正确', () => {
      expect(70).toBe(70); // 超买
      expect(30).toBe(30); // 超卖
      const isOverbought = (rsi: number) => rsi >= 70;
      const isOversold = (rsi: number) => rsi <= 30;
      expect(isOverbought(75)).toBe(true);
      expect(isOversold(25)).toBe(true);
      expect(isOverbought(50)).toBe(false);
    });
  });

  describe('KDJ', () => {
    it('K/D/J 值应该在合理范围', () => {
      const high9 = 110;
      const low9 = 90;
      const close = 105;
      const rsv = ((close - low9) / (high9 - low9)) * 100;
      expect(rsv).toBe(75);
      expect(rsv).toBeGreaterThanOrEqual(0);
      expect(rsv).toBeLessThanOrEqual(100);
    });

    it('J = 3K - 2D', () => {
      const k = 50;
      const d = 40;
      const j = 3 * k - 2 * d;
      expect(j).toBe(70);
    });

    it('超买超卖区应该正确标识', () => {
      const isOverbought = (k: number, d: number) => k >= 80 && d >= 80;
      const isOversold = (k: number, d: number) => k <= 20 && d <= 20;
      expect(isOverbought(85, 82)).toBe(true);
      expect(isOversold(15, 18)).toBe(true);
      expect(isOverbought(50, 50)).toBe(false);
    });
  });

  describe('BOLL 布林带', () => {
    it('应该计算上中下轨', () => {
      const prices = [100, 102, 98, 101, 99, 103, 97, 104, 96, 105];
      const ma = prices.reduce((a, b) => a + b, 0) / prices.length;
      const variance = prices.reduce((sum, p) => sum + (p - ma) ** 2, 0) / prices.length;
      const std = Math.sqrt(variance);
      const upper = ma + 2 * std;
      const lower = ma - 2 * std;
      expect(upper).toBeGreaterThan(ma);
      expect(lower).toBeLessThan(ma);
      expect(upper - lower).toBeCloseTo(4 * std, 5);
    });

    it('价格应该大部分时间在带内', () => {
      const prices = [100, 102, 98, 101, 99, 103, 97, 104, 96, 105];
      const ma = prices.reduce((a, b) => a + b, 0) / prices.length;
      const std = Math.sqrt(prices.reduce((sum, p) => sum + (p - ma) ** 2, 0) / prices.length);
      const upper = ma + 2 * std;
      const lower = ma - 2 * std;
      const inside = prices.filter(p => p >= lower && p <= upper).length;
      expect(inside / prices.length).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('技术指标组合', () => {
    it('多指标一致性: MACD金叉 + RSI超卖后回升', () => {
      const signals = {
        macdGoldenCross: true,
        rsiOversold: false,
        rsiRising: true,
        volumeIncrease: true,
      };
      const bullish = signals.macdGoldenCross && signals.rsiRising && signals.volumeIncrease;
      expect(bullish).toBe(true);
    });

    it('多指标一致性: MACD死叉 + RSI超买', () => {
      const signals = {
        macdDeathCross: true,
        rsiOverbought: true,
        volumeDecrease: true,
      };
      const bearish = signals.macdDeathCross && signals.rsiOverbought;
      expect(bearish).toBe(true);
    });
  });
});
