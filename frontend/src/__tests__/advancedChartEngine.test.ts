import { describe, it, expect } from 'vitest';

// 高级图表引擎
interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MACDResult { dif: number; dea: number; macd: number; signal: 'buy' | 'sell' | 'hold' }
interface KDJResult { k: number; d: number; j: number }
interface BollingerResult { upper: number; middle: number; lower: number; width: number; bandwidth: number }
interface ATRResult { atr: number; tr: number }
interface OBVResult { obv: number; trend: 'up' | 'down' | 'flat' }
interface RSResult { rs: number; rsi: number }

class AdvancedChartEngine {
  static calcEMA(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const result = [values[0]];
    for (let i = 1; i < values.length; i++) {
      result.push(values[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  static calcMACD(closes: number[], fast = 12, slow = 26, signal = 9): MACDResult[] {
    if (closes.length < slow) return [];
    const emaFast = this.calcEMA(closes, fast);
    const emaSlow = this.calcEMA(closes, slow);
    const dif = emaFast.map((f, i) => f - emaSlow[i]);
    const dea = this.calcEMA(dif, signal);
    return dif.map((d, i) => ({
      dif: d,
      dea: dea[i],
      macd: (d - dea[i]) * 2,
      signal: d > dea[i] ? 'buy' : d < dea[i] ? 'sell' : 'hold',
    }));
  }

  static calcKDJ(data: CandleData[], n = 9): KDJResult[] {
    if (data.length < n) return [];
    const results: KDJResult[] = [];
    let prevK = 50, prevD = 50;

    for (let i = n - 1; i < data.length; i++) {
      const slice = data.slice(i - n + 1, i + 1);
      const highest = Math.max(...slice.map(d => d.high));
      const lowest = Math.min(...slice.map(d => d.low));
      const rsv = highest !== lowest ? ((data[i].close - lowest) / (highest - lowest)) * 100 : 50;
      const k = (2 / 3) * prevK + (1 / 3) * rsv;
      const d = (2 / 3) * prevD + (1 / 3) * k;
      const j = 3 * k - 2 * d;
      results.push({ k, d, j });
      prevK = k;
      prevD = d;
    }
    return results;
  }

  static calcBollingerBands(closes: number[], period = 20, multiplier = 2): BollingerResult[] {
    if (closes.length < period) return [];
    const results: BollingerResult[] = [];
    for (let i = period - 1; i < closes.length; i++) {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      results.push({
        upper: mean + multiplier * std,
        middle: mean,
        lower: mean - multiplier * std,
        width: multiplier * std * 2,
        bandwidth: (multiplier * std * 2 / mean) * 100,
      });
    }
    return results;
  }

  static calcRSI(closes: number[], period = 14): number[] {
    if (closes.length < period + 1) return [];
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const results: number[] = [];

    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;
    results.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      avgGain = (avgGain * (period - 1) + Math.max(0, change)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -change)) / period;
      results.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return results;
  }

  static calcATR(data: CandleData[], period = 14): ATRResult[] {
    if (data.length < 2) return [];
    const trs: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      );
      trs.push(tr);
    }
    if (trs.length < period) return [];
    const results: ATRResult[] = [];
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    results.push({ atr, tr: trs[period - 1] });

    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
      results.push({ atr, tr: trs[i] });
    }
    return results;
  }

  static calcOBV(data: CandleData[]): OBVResult[] {
    if (data.length === 0) return [];
    const results: OBVResult[] = [{ obv: data[0].volume, trend: 'flat' }];
    for (let i = 1; i < data.length; i++) {
      const obv = data[i].close > data[i - 1].close
        ? results[i - 1].obv + data[i].volume
        : data[i].close < data[i - 1].close
        ? results[i - 1].obv - data[i].volume
        : results[i - 1].obv;
      const trend = obv > results[i - 1].obv ? 'up' : obv < results[i - 1].obv ? 'down' : 'flat';
      results.push({ obv, trend });
    }
    return results;
  }

  static detectPatterns(data: CandleData[]): { type: string; index: number; confidence: number }[] {
    const patterns: { type: string; index: number; confidence: number }[] = [];
    for (let i = 1; i < data.length; i++) {
      const prev2 = data[i - 2], prev = data[i - 1], curr = data[i];
      // 吞没形态
      if (prev.close < prev.open && curr.close > curr.open && curr.open <= prev.close && curr.close >= prev.open) {
        patterns.push({ type: 'bullish_engulfing', index: i, confidence: 0.7 });
      }
      if (prev.close > prev.open && curr.close < curr.open && curr.open >= prev.close && curr.close <= prev.open) {
        patterns.push({ type: 'bearish_engulfing', index: i, confidence: 0.7 });
      }
      // 十字星
      if (Math.abs(curr.close - curr.open) / (curr.high - curr.low) < 0.1 && curr.high - curr.low > 0) {
        patterns.push({ type: 'doji', index: i, confidence: 0.5 });
      }
      // 锤子线
      const bodySize = Math.abs(curr.close - curr.open);
      const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
      const upperShadow = curr.high - Math.max(curr.open, curr.close);
      if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5 && bodySize > 0) {
        patterns.push({ type: 'hammer', index: i, confidence: 0.6 });
      }
    }
    return patterns;
  }

  static calcRelativeStrength(stockCloses: number[], benchmarkCloses: number[]): RSResult[] {
    if (stockCloses.length !== benchmarkCloses.length || stockCloses.length < 2) return [];
    return stockCloses.map((sc, i) => {
      const rs = benchmarkCloses[i] > 0 ? sc / benchmarkCloses[i] : 0;
      return { rs, rsi: rs * 100 };
    });
  }

  static calcPivotPoints(high: number, low: number, close: number): { pivot: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number } {
    const pivot = (high + low + close) / 3;
    return {
      pivot,
      r1: 2 * pivot - low,
      r2: pivot + (high - low),
      r3: high + 2 * (pivot - low),
      s1: 2 * pivot - high,
      s2: pivot - (high - low),
      s3: low - 2 * (high - pivot),
    };
  }

  static calcFibonacciRetracement(high: number, low: number): { level: number; price: number }[] {
    const diff = high - low;
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    return levels.map(level => ({ level, price: high - diff * level }));
  }
}

describe('高级图表引擎', () => {
  describe('EMA计算', () => {
    it('应该计算EMA', () => {
      const ema = AdvancedChartEngine.calcEMA([100, 102, 104, 103, 105], 3);
      expect(ema).toHaveLength(5);
      expect(ema[0]).toBe(100);
    });

    it('应该处理空数组', () => {
      expect(AdvancedChartEngine.calcEMA([], 3)).toHaveLength(0);
    });
  });

  describe('MACD指标', () => {
    it('应该计算MACD', () => {
      const closes = Array(30).fill(0).map((_, i) => 100 + Math.sin(i / 3) * 5);
      const macd = AdvancedChartEngine.calcMACD(closes);
      expect(macd.length).toBeGreaterThan(0);
      macd.forEach(m => {
        expect(['buy', 'sell', 'hold']).toContain(m.signal);
      });
    });

    it('应该处理数据不足的情况', () => {
      expect(AdvancedChartEngine.calcMACD([1, 2, 3])).toHaveLength(0);
    });
  });

  describe('KDJ指标', () => {
    it('应该计算KDJ', () => {
      const data: CandleData[] = Array(15).fill(null).map((_, i) => ({
        date: `2026-03-${String(i + 1).padStart(2, '0')}`,
        open: 100 + Math.random() * 5,
        high: 105 + Math.random() * 3,
        low: 95 + Math.random() * 3,
        close: 100 + Math.random() * 5,
        volume: 10000 + Math.random() * 5000,
      }));
      const kdj = AdvancedChartEngine.calcKDJ(data);
      expect(kdj.length).toBeGreaterThan(0);
      kdj.forEach(k => {
        expect(k.k).toBeGreaterThanOrEqual(0);
        expect(k.d).toBeGreaterThanOrEqual(0);
      });
    });

    it('应该处理数据不足', () => {
      expect(AdvancedChartEngine.calcKDJ([] as any, 9)).toHaveLength(0);
    });
  });

  describe('布林带', () => {
    it('应该计算布林带', () => {
      const closes = Array(25).fill(0).map((_, i) => 100 + Math.sin(i / 5) * 3);
      const bb = AdvancedChartEngine.calcBollingerBands(closes);
      expect(bb.length).toBeGreaterThan(0);
      bb.forEach(b => {
        expect(b.upper).toBeGreaterThan(b.middle);
        expect(b.lower).toBeLessThan(b.middle);
        expect(b.width).toBeGreaterThan(0);
      });
    });

    it('应该处理数据不足', () => {
      expect(AdvancedChartEngine.calcBollingerBands([1, 2, 3])).toHaveLength(0);
    });

    it('等幅波动的带宽应该接近0', () => {
      const closes = Array(25).fill(100);
      const bb = AdvancedChartEngine.calcBollingerBands(closes);
      expect(bb[bb.length - 1].bandwidth).toBeCloseTo(0, 1);
    });
  });

  describe('RSI指标', () => {
    it('应该计算RSI', () => {
      const closes = Array(20).fill(0).map((_, i) => 100 + i * 0.5);
      const rsi = AdvancedChartEngine.calcRSI(closes);
      expect(rsi.length).toBeGreaterThan(0);
      rsi.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(100);
      });
    });

    it('持续上涨的RSI应该接近100', () => {
      const closes = Array(20).fill(0).map((_, i) => 100 + i);
      const rsi = AdvancedChartEngine.calcRSI(closes);
      expect(rsi[rsi.length - 1]).toBe(100);
    });

    it('应该处理数据不足', () => {
      expect(AdvancedChartEngine.calcRSI([1, 2, 3])).toHaveLength(0);
    });
  });

  describe('ATR指标', () => {
    it('应该计算ATR', () => {
      const data: CandleData[] = Array(20).fill(null).map((_, i) => ({
        date: `${i}`, open: 100, high: 103 + Math.random(), low: 97 - Math.random(), close: 100 + Math.random() * 2, volume: 10000,
      }));
      const atr = AdvancedChartEngine.calcATR(data);
      expect(atr.length).toBeGreaterThan(0);
      atr.forEach(a => expect(a.atr).toBeGreaterThan(0));
    });
  });

  describe('OBV指标', () => {
    it('应该计算OBV', () => {
      const data: CandleData[] = [
        { date: '1', open: 0, high: 0, low: 0, close: 100, volume: 1000 },
        { date: '2', open: 0, high: 0, low: 0, close: 102, volume: 2000 },
        { date: '3', open: 0, high: 0, low: 0, close: 101, volume: 1500 },
      ];
      const obv = AdvancedChartEngine.calcOBV(data);
      expect(obv).toHaveLength(3);
      expect(obv[1].obv).toBe(3000);
      expect(obv[2].obv).toBe(1500);
      expect(obv[1].trend).toBe('up');
      expect(obv[2].trend).toBe('down');
    });
  });

  describe('K线形态检测', () => {
    it('应该检测吞没形态', () => {
      const data: CandleData[] = [
        { date: '1', open: 105, high: 106, low: 99, close: 100, volume: 1000 },
        { date: '2', open: 99, high: 107, low: 98, close: 106, volume: 2000 },
      ];
      const patterns = AdvancedChartEngine.detectPatterns(data);
      expect(patterns.some(p => p.type === 'bullish_engulfing')).toBe(true);
    });

    it('应该检测十字星', () => {
      const data: CandleData[] = [
        { date: '1', open: 100, high: 105, low: 95, close: 101, volume: 1000 },
        { date: '2', open: 100, high: 105, low: 95, close: 101, volume: 1000 },
        { date: '3', open: 100.5, high: 106, low: 94, close: 100.4, volume: 1000 },
      ];
      const patterns = AdvancedChartEngine.detectPatterns(data);
      expect(patterns.some(p => p.type === 'doji')).toBe(true);
    });
  });

  describe('枢轴点', () => {
    it('应该计算枢轴点', () => {
      const pp = AdvancedChartEngine.calcPivotPoints(110, 90, 105);
      expect(pp.pivot).toBeCloseTo(101.67, 1);
      expect(pp.r1).toBeGreaterThan(pp.pivot);
      expect(pp.s1).toBeLessThan(pp.pivot);
      expect(pp.r2).toBeGreaterThan(pp.r1);
      expect(pp.s2).toBeLessThan(pp.s1);
    });
  });

  describe('斐波那契回调', () => {
    it('应该计算回调位', () => {
      const fib = AdvancedChartEngine.calcFibonacciRetracement(120, 80);
      expect(fib).toHaveLength(7);
      expect(fib[0].price).toBe(120);
      expect(fib[6].price).toBe(80);
      expect(fib.find(f => f.level === 0.618)!.price).toBeCloseTo(95.28, 1);
    });
  });

  describe('相对强度', () => {
    it('应该计算相对强度', () => {
      const stock = [100, 105, 110, 108, 115];
      const bench = [100, 102, 104, 103, 106];
      const rs = AdvancedChartEngine.calcRelativeStrength(stock, bench);
      expect(rs).toHaveLength(5);
      expect(rs[1].rs).toBeGreaterThan(1);
    });

    it('应该处理长度不匹配', () => {
      expect(AdvancedChartEngine.calcRelativeStrength([1, 2], [1])).toHaveLength(0);
    });
  });
});
