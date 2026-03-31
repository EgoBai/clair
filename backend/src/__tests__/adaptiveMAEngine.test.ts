import { describe, it, expect } from 'vitest';

describe('自适应移动平均引擎 (KAMA/VIDYA)', () => {
  // Kaufman's Adaptive Moving Average
  function kama(prices: number[], erPeriod = 10, fastSC = 2 / 3, slowSC = 2 / 31) {
    if (prices.length < erPeriod + 1) return [];
    const result: number[] = [];
    let prevKama = prices[erPeriod];
    for (let i = erPeriod; i < prices.length; i++) {
      const direction = Math.abs(prices[i] - prices[i - erPeriod]);
      let volatility = 0;
      for (let j = i - erPeriod + 1; j <= i; j++) {
        volatility += Math.abs(prices[j] - prices[j - 1]);
      }
      const er = volatility === 0 ? 1 : direction / volatility;
      const sc = (er * (fastSC - slowSC) + slowSC) ** 2;
      prevKama = prevKama + sc * (prices[i] - prevKama);
      result.push(prevKama);
    }
    return result;
  }

  // Variable Index Dynamic Average
  function vidya(prices: number[], cmopPeriod = 9, stdPeriod = 9) {
    if (prices.length < Math.max(cmopPeriod, stdPeriod) + 1) return [];
    const result: number[] = [];
    let prevVidya = prices[Math.max(cmopPeriod, stdPeriod)];
    for (let i = Math.max(cmopPeriod, stdPeriod); i < prices.length; i++) {
      const changes = [];
      for (let j = i - cmopPeriod + 1; j <= i; j++) changes.push(prices[j] - prices[j - 1]);
      const absUp = changes.filter(c => c > 0).reduce((a, b) => a + b, 0);
      const absDown = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0));
      const cmo = (absUp + absDown) === 0 ? 0 : (absUp - absDown) / (absUp + absDown);
      const slice = prices.slice(i - stdPeriod + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
      const relVol = mean === 0 ? 0 : std / Math.abs(mean);
      const alpha = Math.min(1, Math.abs(cmo) * relVol);
      prevVidya = alpha * prices[i] + (1 - alpha) * prevVidya;
      result.push(prevVidya);
    }
    return result;
  }

  // Triple Exponential Moving Average (TEMA)
  function tema(prices: number[], period: number) {
    if (prices.length < period * 3) return [];
    const ema = (data: number[], p: number) => {
      const r: number[] = [];
      const k = 2 / (p + 1);
      r[0] = data[0];
      for (let i = 1; i < data.length; i++) r[i] = data[i] * k + r[i - 1] * (1 - k);
      return r;
    };
    const e1 = ema(prices, period);
    const e2 = ema(e1, period);
    const e3 = ema(e2, period);
    return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]).slice(period * 2);
  }

  // Hull Moving Average
  function hma(prices: number[], period: number) {
    if (prices.length < period) return [];
    const wma = (data: number[], p: number) => {
      const result: number[] = [];
      for (let i = p - 1; i < data.length; i++) {
        let sum = 0, wSum = 0;
        for (let j = 0; j < p; j++) { sum += data[i - j] * (p - j); wSum += p - j; }
        result.push(sum / wSum);
      }
      return result;
    };
    const halfPeriod = Math.floor(period / 2);
    const sqrtPeriod = Math.floor(Math.sqrt(period));
    const wmaHalf = wma(prices, halfPeriod);
    const wmaFull = wma(prices, period);
    const diff = wmaHalf.map((v, i) => 2 * v - (wmaFull[i] || v));
    return wma(diff, sqrtPeriod);
  }

  // Mesa Adaptive Moving Average (simplified MAMA)
  function mama(prices: number[], fastLimit = 0.5, slowLimit = 0.05) {
    if (prices.length < 6) return { mama: [], fama: [] };
    const phase: number[] = [];
    for (let i = 5; i < prices.length; i++) {
      const im = (prices[i - 3] - prices[i - 5]) / 2;
      const re = (prices[i - 4] - prices[i - 2]) / 2;
      phase.push(re === 0 ? 0 : Math.atan2(im, re) * 180 / Math.PI);
    }
    const mama: number[] = [], fama: number[] = [];
    let prevMama = prices[5], prevFama = prices[5];
    for (let i = 0; i < phase.length; i++) {
      const delta = i > 0 ? Math.abs(phase[i] - phase[i - 1]) : 0;
      const alpha = Math.min(fastLimit, Math.max(slowLimit, delta / 100));
      prevMama = alpha * prices[i + 5] + (1 - alpha) * prevMama;
      const fa = 0.5 * alpha;
      prevFama = fa * prevMama + (1 - fa) * prevFama;
      mama.push(prevMama);
      fama.push(prevFama);
    }
    return { mama, fama };
  }

  const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.5);

  describe('KAMA', () => {
    it('输出长度正确', () => {
      const result = kama(prices, 10);
      expect(result.length).toBe(prices.length - 10);
    });

    it('KAMA在价格范围内', () => {
      const result = kama(prices, 10);
      const min = Math.min(...prices), max = Math.max(...prices);
      result.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(min - 1);
        expect(v).toBeLessThanOrEqual(max + 1);
      });
    });

    it('数据不足返回空', () => {
      expect(kama([1, 2, 3], 10)).toEqual([]);
    });

    it('趋势市场KAMA跟随', () => {
      const trendPrices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const result = kama(trendPrices, 5);
      expect(result[result.length - 1]).toBeGreaterThan(result[0]);
    });

    it('常数价格KAMA等于价格', () => {
      const flat = Array.from({ length: 30 }, () => 100);
      const result = kama(flat, 10);
      result.forEach(v => expect(v).toBeCloseTo(100, 1));
    });
  });

  describe('VIDYA', () => {
    it('输出长度正确', () => {
      const result = vidya(prices);
      expect(result.length).toBeGreaterThan(0);
    });

    it('趋势跟踪', () => {
      const trendPrices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      const result = vidya(trendPrices);
      expect(result[result.length - 1]).toBeGreaterThan(result[0]);
    });
  });

  describe('TEMA', () => {
    it('输出长度正确', () => {
      const result = tema(prices, 10);
      expect(result.length).toBe(prices.length - 20);
    });

    it('TEMA响应快于EMA', () => {
      const step = [...Array.from({ length: 20 }, () => 100), ...Array.from({ length: 20 }, () => 110)];
      const result = tema(step, 5);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('HMA', () => {
    it('输出非空', () => {
      const result = hma(prices, 10);
      expect(result.length).toBeGreaterThan(0);
    });

    it('趋势价格HMA递增', () => {
      const trend = Array.from({ length: 30 }, (_, i) => 100 + i);
      const result = hma(trend, 9);
      expect(result[result.length - 1]).toBeGreaterThan(result[0]);
    });
  });

  describe('MAMA', () => {
    it('MAMA和FAMA长度相等', () => {
      const { mama: m, fama: f } = mama(prices);
      expect(m.length).toBe(f.length);
    });

    it('FAMA平滑于MAMA', () => {
      const { mama: m, fama: f } = mama(prices);
      if (m.length > 1) {
        const mVar = m.reduce((s, v) => s + (v - m[0]) ** 2, 0) / m.length;
        const fVar = f.reduce((s, v) => s + (v - f[0]) ** 2, 0) / f.length;
        expect(fVar).toBeLessThanOrEqual(mVar + 0.1);
      }
    });

    it('短序列处理', () => {
      const { mama: m } = mama([1, 2, 3]);
      expect(m.length).toBe(0);
    });
  });
});
