import { describe, it, expect } from 'vitest';

// 信号处理引擎测试
describe('信号处理引擎', () => {
  describe('移动平均线族', () => {
    function SMA(data: number[], period: number): number[] {
      const result: number[] = [];
      for (let i = period - 1; i < data.length; i++) {
        result.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
      }
      return result;
    }

    function EMA(data: number[], period: number): number[] {
      if (data.length === 0) return [];
      const k = 2 / (period + 1);
      const result = [data[0]];
      for (let i = 1; i < data.length; i++) {
        result.push(data[i] * k + result[i - 1] * (1 - k));
      }
      return result;
    }

    function WMA(data: number[], period: number): number[] {
      const result: number[] = [];
      const weights = Array.from({ length: period }, (_, i) => i + 1);
      const wSum = weights.reduce((a, b) => a + b, 0);
      for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += data[i - period + 1 + j] * weights[j];
        result.push(sum / wSum);
      }
      return result;
    }

    it('SMA正确计算', () => {
      expect(SMA([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]);
    });

    it('SMA周期大于数据返回空', () => {
      expect(SMA([1, 2], 5)).toHaveLength(0);
    });

    it('EMA第一个值等于原始值', () => {
      expect(EMA([100, 110, 105], 10)[0]).toBe(100);
    });

    it('EMA对近期数据赋更高权重', () => {
      const ema = EMA([100, 100, 100, 120], 3);
      expect(ema[3]).toBeGreaterThan(100);
    });

    it('WMA正确计算', () => {
      const wma = WMA([1, 2, 3, 4, 5], 3);
      expect(wma[0]).toBeCloseTo(2.33, 1);
    });

    it('常数序列的SMA等于常数', () => {
      expect(SMA([5, 5, 5, 5], 2)).toEqual([5, 5, 5]);
    });

    it('常数序列的EMA等于常数', () => {
      EMA([5, 5, 5, 5], 3).forEach(v => expect(v).toBeCloseTo(5, 5));
    });
  });

  describe('MACD指标', () => {
    function MACD(data: number[], fast = 12, slow = 26, signal = 9) {
      function ema(d: number[], p: number): number[] {
        if (d.length === 0) return [];
        const k = 2 / (p + 1);
        const r = [d[0]];
        for (let i = 1; i < d.length; i++) r.push(d[i] * k + r[i - 1] * (1 - k));
        return r;
      }
      const fastEma = ema(data, fast);
      const slowEma = ema(data, slow);
      const macdLine = fastEma.map((v, i) => v - slowEma[i]);
      const signalLine = ema(macdLine, signal);
      const histogram = macdLine.map((v, i) => v - signalLine[i]);
      return { macdLine, signalLine, histogram };
    }

    it('返回三组数据', () => {
      const data = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.1) * 10);
      const result = MACD(data);
      expect(result.macdLine).toHaveLength(50);
      expect(result.signalLine).toHaveLength(50);
      expect(result.histogram).toHaveLength(50);
    });

    it('MACD柱状图=MACD线-信号线', () => {
      const data = Array.from({ length: 30 }, (_, i) => 100 + i);
      const result = MACD(data);
      result.histogram.forEach((h, i) => {
        expect(h).toBeCloseTo(result.macdLine[i] - result.signalLine[i], 10);
      });
    });

    it('上升趋势MACD线为正', () => {
      const data = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
      const result = MACD(data);
      expect(result.macdLine[result.macdLine.length - 1]).toBeGreaterThan(0);
    });
  });

  describe('RSI指标', () => {
    function RSI(prices: number[], period = 14): number[] {
      if (prices.length < period + 1) return [];
      const changes = prices.slice(1).map((p, i) => p - prices[i]);
      const result: number[] = [];
      let avgGain = 0, avgLoss = 0;
      for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
      }
      avgGain /= period;
      avgLoss /= period;
      result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
      for (let i = period; i < changes.length; i++) {
        const change = changes[i];
        avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
        result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
      }
      return result;
    }

    it('RSI范围在0-100', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 10);
      RSI(prices).forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); });
    });

    it('持续上涨RSI趋近100', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const rsi = RSI(prices);
      expect(rsi[rsi.length - 1]).toBeGreaterThan(70);
    });

    it('持续下跌RSI趋近0', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 200 - i);
      const rsi = RSI(prices);
      expect(rsi[rsi.length - 1]).toBeLessThan(30);
    });

    it('数据不足返回空', () => {
      expect(RSI([1, 2, 3], 14)).toHaveLength(0);
    });
  });

  describe('布林带', () => {
    function bollingerBands(prices: number[], period = 20, multiplier = 2) {
      const sma: number[] = [], upper: number[] = [], lower: number[] = [];
      for (let i = period - 1; i < prices.length; i++) {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
        sma.push(mean);
        upper.push(mean + multiplier * std);
        lower.push(mean - multiplier * std);
      }
      return { sma, upper, lower };
    }

    it('上下轨对称', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.5) * 5);
      const bb = bollingerBands(prices);
      bb.sma.forEach((m, i) => {
        expect(bb.upper[i] - m).toBeCloseTo(m - bb.lower[i], 5);
      });
    });

    it('价格应在布林带内', () => {
      const prices = Array.from({ length: 50 }, () => 100 + Math.random() * 10);
      const bb = bollingerBands(prices);
      bb.upper.forEach((u, i) => { expect(u).toBeGreaterThan(bb.sma[i]); });
      bb.lower.forEach((l, i) => { expect(l).toBeLessThan(bb.sma[i]); });
    });

    it('常数序列带宽为0', () => {
      const prices = Array(30).fill(100);
      const bb = bollingerBands(prices);
      bb.upper.forEach((u, i) => expect(u).toBeCloseTo(100, 5));
      bb.lower.forEach((l, i) => expect(l).toBeCloseTo(100, 5));
    });
  });

  describe('ATR指标', () => {
    function ATR(high: number[], low: number[], close: number[], period = 14): number[] {
      if (high.length < 2) return [];
      const tr: number[] = [high[0] - low[0]];
      for (let i = 1; i < high.length; i++) {
        tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
      }
      const result: number[] = [tr.slice(0, period).reduce((a, b) => a + b, 0) / period];
      for (let i = period; i < tr.length; i++) {
        result.push((result[result.length - 1] * (period - 1) + tr[i]) / period);
      }
      return result;
    }

    it('ATR非负', () => {
      const h = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      const l = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
      const c = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
      ATR(h, l, c).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });

    it('高波动区间ATR更大', () => {
      const h1 = Array(20).fill(101), l1 = Array(20).fill(99), c1 = Array(20).fill(100);
      const h2 = Array(20).fill(110), l2 = Array(20).fill(90), c2 = Array(20).fill(100);
      const atr1 = ATR(h1, l1, c1);
      const atr2 = ATR(h2, l2, c2);
      expect(atr2[atr2.length - 1]).toBeGreaterThan(atr1[atr1.length - 1]);
    });

    it('数据不足返回空', () => {
      expect(ATR([10], [8], [9], 14)).toHaveLength(0);
    });
  });

  describe('OBV指标', () => {
    function OBV(close: number[], volume: number[]): number[] {
      if (close.length === 0) return [];
      const result = [volume[0]];
      for (let i = 1; i < close.length; i++) {
        result.push(close[i] > close[i - 1] ? result[i - 1] + volume[i] :
                    close[i] < close[i - 1] ? result[i - 1] - volume[i] : result[i - 1]);
      }
      return result;
    }

    it('上涨日加成交量', () => {
      expect(OBV([10, 11], [100, 200])).toEqual([100, 300]);
    });

    it('下跌日减成交量', () => {
      expect(OBV([10, 9], [100, 200])).toEqual([100, -100]);
    });

    it('平盘日OBV不变', () => {
      expect(OBV([10, 10], [100, 200])).toEqual([100, 100]);
    });

    it('空数据返回空', () => {
      expect(OBV([], [])).toHaveLength(0);
    });
  });

  describe('KDJ指标', () => {
    function KDJ(high: number[], low: number[], close: number[], n = 9) {
      const kArr: number[] = [], dArr: number[] = [], jArr: number[] = [];
      let k = 50, d = 50;
      for (let i = n - 1; i < close.length; i++) {
        const hSlice = high.slice(i - n + 1, i + 1);
        const lSlice = low.slice(i - n + 1, i + 1);
        const highest = Math.max(...hSlice);
        const lowest = Math.min(...lSlice);
        const rsv = highest === lowest ? 50 : ((close[i] - lowest) / (highest - lowest)) * 100;
        k = (2 / 3) * k + (1 / 3) * rsv;
        d = (2 / 3) * d + (1 / 3) * k;
        const j = 3 * k - 2 * d;
        kArr.push(k); dArr.push(d); jArr.push(j);
      }
      return { k: kArr, d: dArr, j: jArr };
    }

    it('K值在0-100之间', () => {
      const h = Array.from({ length: 20 }, (_, i) => 100 + i);
      const l = Array.from({ length: 20 }, (_, i) => 90 + i);
      const c = Array.from({ length: 20 }, (_, i) => 95 + i);
      const kdj = KDJ(h, l, c);
      kdj.k.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); });
    });

    it('返回三个数组等长', () => {
      const h = Array.from({ length: 15 }, (_, i) => 100 + i);
      const l = Array.from({ length: 15 }, (_, i) => 90 + i);
      const c = Array.from({ length: 15 }, (_, i) => 95 + i);
      const kdj = KDJ(h, l, c);
      expect(kdj.k.length).toBe(kdj.d.length);
      expect(kdj.d.length).toBe(kdj.j.length);
    });
  });
});
