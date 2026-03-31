import { describe, it, expect } from 'vitest';

describe('聪明钱指数与Smart Money追踪引擎', () => {
  // Smart Money Index (SMI)
  function smartMoneyIndex(openPrices: number[], closePrices: number[], volumes: number[]) {
    if (openPrices.length < 2) return [];
    const smi: number[] = [];
    let cumulativeSMI = 0;
    for (let i = 1; i < openPrices.length; i++) {
      const overnightGap = openPrices[i] - closePrices[i - 1];
      const intradayMove = closePrices[i] - openPrices[i];
      const smartComponent = intradayMove - overnightGap * 0.5;
      cumulativeSMI += smartComponent;
      smi.push(cumulativeSMI);
    }
    return smi;
  }

  // Large Order Flow Detection
  function largeOrderDetection(prices: number[], volumes: number[], avgWindow = 20, multiplier = 2) {
    if (prices.length < avgWindow) return [];
    const results: { index: number; type: 'buy_pressure' | 'sell_pressure' | 'neutral'; volRatio: number }[] = [];
    for (let i = avgWindow; i < prices.length; i++) {
      const avgVol = volumes.slice(i - avgWindow, i).reduce((a, b) => a + b, 0) / avgWindow;
      const volRatio = volumes[i] / avgVol;
      if (volRatio > multiplier) {
        const priceChange = prices[i] - prices[i - 1];
        results.push({
          index: i,
          type: priceChange > 0 ? 'buy_pressure' : priceChange < 0 ? 'sell_pressure' : 'neutral',
          volRatio,
        });
      }
    }
    return results;
  }

  // Accumulation/Distribution Line
  function accumulationDistribution(highs: number[], lows: number[], closes: number[], volumes: number[]) {
    let adLine = 0;
    return closes.map((c, i) => {
      const range = highs[i] - lows[i];
      const mfm = range === 0 ? 0 : ((c - lows[i]) - (highs[i] - c)) / range;
      adLine += mfm * volumes[i];
      return adLine;
    });
  }

  // Chaikin Money Flow
  function chaikinMoneyFlow(highs: number[], lows: number[], closes: number[], volumes: number[], period = 20) {
    if (closes.length < period) return [];
    const result: number[] = [];
    for (let i = period - 1; i < closes.length; i++) {
      let mfmSum = 0, volSum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const range = highs[j] - lows[j];
        mfmSum += range === 0 ? 0 : ((closes[j] - lows[j]) - (highs[j] - closes[j])) / range * volumes[j];
        volSum += volumes[j];
      }
      result.push(volSum === 0 ? 0 : mfmSum / volSum);
    }
    return result;
  }

  // Ease of Movement
  function easeOfMovement(highs: number[], lows: number[], volumes: number[], period = 14) {
    if (highs.length < 2) return [];
    const emv: number[] = [];
    for (let i = 1; i < highs.length; i++) {
      const midMove = ((highs[i] + lows[i]) / 2) - ((highs[i - 1] + lows[i - 1]) / 2);
      const boxRatio = volumes[i] === 0 ? 0 : ((highs[i] - lows[i]) / volumes[i]) * 1e6;
      emv.push(boxRatio === 0 ? 0 : midMove / boxRatio);
    }
    // Smooth
    const result: number[] = [];
    for (let i = period - 1; i < emv.length; i++) {
      result.push(emv.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
    }
    return result;
  }

  // Money Flow Volume Divergence
  function moneyFlowDivergence(prices: number[], mfi: number[], window = 10) {
    if (prices.length < window || mfi.length < window) return { priceDirection: 'flat', mfiDirection: 'flat', divergent: false };
    const priceChange = prices[prices.length - 1] - prices[prices.length - window];
    const mfiChange = mfi[mfi.length - 1] - mfi[mfi.length - window];
    const priceDir = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'flat';
    const mfiDir = mfiChange > 5 ? 'up' : mfiChange < -5 ? 'down' : 'flat';
    return {
      priceDirection: priceDir,
      mfiDirection: mfiDir,
      divergent: (priceDir === 'up' && mfiDir === 'down') || (priceDir === 'down' && mfiDir === 'up'),
    };
  }

  const n = 60;
  const opens = Array.from({ length: n }, (_, i) => 100 + i * 0.5 + Math.random());
  const closes = opens.map((o, i) => o + (Math.random() - 0.4) * 2);
  const highs = closes.map((c, i) => Math.max(c, opens[i]) + Math.random());
  const lows = closes.map((c, i) => Math.min(c, opens[i]) - Math.random());
  const vols = Array.from({ length: n }, () => 1000 + Math.random() * 4000);

  describe('聪明钱指数', () => {
    it('长度 = prices - 1', () => {
      const smi = smartMoneyIndex(opens, closes, vols);
      expect(smi.length).toBe(n - 1);
    });

    it('数值有效', () => {
      const smi = smartMoneyIndex(opens, closes, vols);
      smi.forEach(v => expect(isNaN(v)).toBe(false));
    });

    it('数据不足返回空', () => {
      expect(smartMoneyIndex([1], [1], [1])).toEqual([]);
    });
  });

  describe('大单检测', () => {
    it('检测到大单', () => {
      const heavyVols = vols.map(v => v * 3);
      const result = largeOrderDetection(closes, heavyVols, 20, 1.5);
      expect(result.length).toBeGreaterThan(0);
    });

    it('类型有效', () => {
      const heavyVols = vols.map(v => v * 3);
      const result = largeOrderDetection(closes, heavyVols, 20, 1.5);
      result.forEach(r => expect(['buy_pressure', 'sell_pressure', 'neutral']).toContain(r.type));
    });
  });

  describe('累积/派发线', () => {
    it('长度匹配', () => {
      const ad = accumulationDistribution(highs, lows, closes, vols);
      expect(ad.length).toBe(n);
    });

    it('数值有效', () => {
      const ad = accumulationDistribution(highs, lows, closes, vols);
      ad.forEach(v => expect(isNaN(v)).toBe(false));
    });
  });

  describe('Chaikin资金流', () => {
    it('CMF在-1到1', () => {
      const cmf = chaikinMoneyFlow(highs, lows, closes, vols, 10);
      cmf.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      });
    });

    it('数据不足返回空', () => {
      expect(chaikinMoneyFlow([1], [1], [1], [1], 10)).toEqual([]);
    });
  });

  describe('轻松运动指标', () => {
    it('返回数值数组', () => {
      const emv = easeOfMovement(highs, lows, vols, 5);
      expect(emv.length).toBeGreaterThan(0);
      emv.forEach(v => expect(isNaN(v)).toBe(false));
    });
  });

  describe('资金流背离', () => {
    it('检测背离', () => {
      const risingPrices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const fallingMFI = Array.from({ length: 20 }, (_, i) => 80 - i * 2);
      const div = moneyFlowDivergence(risingPrices, fallingMFI, 10);
      expect(div.divergent).toBe(true);
    });

    it('无背离', () => {
      const risingPrices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const risingMFI = Array.from({ length: 20 }, (_, i) => 30 + i * 2);
      const div = moneyFlowDivergence(risingPrices, risingMFI, 10);
      expect(div.divergent).toBe(false);
    });
  });
});
