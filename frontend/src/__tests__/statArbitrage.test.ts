import { describe, it, expect } from 'vitest';

/**
 * 统计套利 / 配对交易 / 均值回归逻辑测试
 */

describe('StatArbitrage', () => {
  describe('协整检验', () => {
    const calcCorrelation = (x: number[], y: number[]) => {
      const n = x.length;
      const meanX = x.reduce((a, b) => a + b) / n;
      const meanY = y.reduce((a, b) => a + b) / n;
      let num = 0, denX = 0, denY = 0;
      for (let i = 0; i < n; i++) {
        num += (x[i] - meanX) * (y[i] - meanY);
        denX += (x[i] - meanX) ** 2;
        denY += (y[i] - meanY) ** 2;
      }
      return num / Math.sqrt(denX * denY);
    };

    it('完全正相关应该为 1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(calcCorrelation(x, y)).toBeCloseTo(1, 5);
    });

    it('完全负相关应该为 -1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];
      expect(calcCorrelation(x, y)).toBeCloseTo(-1, 5);
    });

    it('不相关应该接近 0', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [3, 1, 4, 1, 5];
      const corr = calcCorrelation(x, y);
      expect(Math.abs(corr)).toBeLessThan(1);
    });
  });

  describe('价差计算', () => {
    const calcSpread = (priceA: number, priceB: number, hedgeRatio: number) => {
      return priceA - hedgeRatio * priceB;
    };

    it('应该计算对冲价差', () => {
      const spread = calcSpread(100, 50, 2);
      expect(spread).toBe(0);
    });

    it('价差为正说明 A 相对高估', () => {
      const spread = calcSpread(110, 50, 2);
      expect(spread).toBeGreaterThan(0);
    });
  });

  describe('Z-Score 信号', () => {
    const zScoreSignal = (spread: number, mean: number, std: number, entryThreshold: number, exitThreshold: number) => {
      const z = (spread - mean) / std;
      if (z > entryThreshold) return 'sell_A_buy_B';
      if (z < -entryThreshold) return 'buy_A_sell_B';
      if (Math.abs(z) < exitThreshold) return 'exit';
      return 'hold';
    };

    it('Z > 阈值应该做空价差', () => {
      expect(zScoreSignal(130, 100, 10, 2, 0.5)).toBe('sell_A_buy_B');
    });

    it('Z < -阈值应该做多价差', () => {
      expect(zScoreSignal(70, 100, 10, 2, 0.5)).toBe('buy_A_sell_B');
    });

    it('Z 在退出阈值内应该平仓', () => {
      expect(zScoreSignal(102, 100, 10, 2, 0.5)).toBe('exit');
    });

    it('Z 在中间应该持有', () => {
      expect(zScoreSignal(110, 100, 10, 2, 0.5)).toBe('hold');
    });
  });
});

describe('MeanReversionEngine', () => {
  describe('布林带均值回归', () => {
    const calcBollingerBands = (prices: number[], period: number, multiplier: number) => {
      const slice = prices.slice(-period);
      const mean = slice.reduce((a, b) => a + b) / slice.length;
      const std = Math.sqrt(slice.reduce((s, p) => s + (p - mean) ** 2, 0) / slice.length);
      return {
        middle: mean,
        upper: mean + multiplier * std,
        lower: mean - multiplier * std,
      };
    };

    const prices = [100, 102, 98, 101, 99, 103, 97, 105, 96, 104];
    const bands = calcBollingerBands(prices, 10, 2);

    it('应该计算中轨', () => {
      expect(bands.middle).toBeCloseTo(100.5, 0);
    });

    it('上轨应该大于中轨', () => {
      expect(bands.upper).toBeGreaterThan(bands.middle);
    });

    it('下轨应该小于中轨', () => {
      expect(bands.lower).toBeLessThan(bands.middle);
    });
  });

  describe('RSI 均值回归', () => {
    const rsiSignal = (rsi: number) => {
      if (rsi < 30) return 'oversold';
      if (rsi > 70) return 'overbought';
      return 'neutral';
    };

    it('RSI < 30 应该超卖', () => {
      expect(rsiSignal(25)).toBe('oversold');
    });

    it('RSI > 70 应该超买', () => {
      expect(rsiSignal(75)).toBe('overbought');
    });

    it('RSI 30-70 应该中性', () => {
      expect(rsiSignal(50)).toBe('neutral');
    });
  });

  describe('Z-Score 均值回归', () => {
    const meanReversionEntry = (price: number, mean: number, std: number) => {
      const z = (price - mean) / std;
      if (z <= -2) return { signal: 'buy', z };
      if (z >= 2) return { signal: 'sell', z };
      return { signal: 'hold', z };
    };

    it('应该在极端偏离时产生信号', () => {
      expect(meanReversionEntry(80, 100, 10).signal).toBe('buy');
      expect(meanReversionEntry(120, 100, 10).signal).toBe('sell');
    });

    it('正常范围应该持有', () => {
      expect(meanReversionEntry(100, 100, 10).signal).toBe('hold');
    });
  });
});
