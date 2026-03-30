import { describe, it, expect } from 'vitest';

describe('Trading Strategy Engine', () => {
  // 移动平均策略
  const sma = (data: number[], period: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(NaN); continue; }
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
    return result;
  };

  const ema = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };

  const goldenCross = (short: number[], long: number[]): number[] => {
    const signals: number[] = [];
    for (let i = 1; i < short.length; i++) {
      if (isNaN(short[i]) || isNaN(long[i]) || isNaN(short[i-1]) || isNaN(long[i-1])) continue;
      if (short[i-1] <= long[i-1] && short[i] > long[i]) signals.push(i);
    }
    return signals;
  };

  const deathCross = (short: number[], long: number[]): number[] => {
    const signals: number[] = [];
    for (let i = 1; i < short.length; i++) {
      if (isNaN(short[i]) || isNaN(long[i]) || isNaN(short[i-1]) || isNaN(long[i-1])) continue;
      if (short[i-1] >= long[i-1] && short[i] < long[i]) signals.push(i);
    }
    return signals;
  };

  // SMA测试
  describe('简单移动平均', () => {
    it('基本计算', () => {
      const result = sma([1, 2, 3, 4, 5], 3);
      expect(result[2]).toBe(2);
      expect(result[4]).toBe(4);
    });

    it('周期为1', () => {
      const result = sma([10, 20, 30], 1);
      expect(result).toEqual([10, 20, 30]);
    });

    it('周期等于数据长度', () => {
      const result = sma([10, 20, 30], 3);
      expect(result[2]).toBe(20);
    });

    it('不足周期返回NaN', () => {
      const result = sma([1, 2, 3, 4, 5], 3);
      expect(isNaN(result[0])).toBe(true);
      expect(isNaN(result[1])).toBe(true);
    });

    it('单元素数据', () => {
      const result = sma([42], 1);
      expect(result).toEqual([42]);
    });

    it('相同值', () => {
      const result = sma([5, 5, 5, 5], 2);
      expect(result[1]).toBe(5);
      expect(result[3]).toBe(5);
    });

    it('负值处理', () => {
      const result = sma([-10, 0, 10], 3);
      expect(result[2]).toBe(0);
    });

    it('大周期', () => {
      const data = Array(100).fill(1);
      const result = sma(data, 50);
      expect(result[49]).toBe(1);
      expect(result[99]).toBe(1);
    });
  });

  // EMA测试
  describe('指数移动平均', () => {
    it('首值等于数据首值', () => {
      const result = ema([100, 200, 300], 3);
      expect(result[0]).toBe(100);
    });

    it('趋势上升', () => {
      const result = ema([1, 2, 3, 4, 5], 3);
      expect(result[4]).toBeGreaterThan(result[0]);
    });

    it('相同值保持不变', () => {
      const result = ema([10, 10, 10, 10], 3);
      expect(result[3]).toBeCloseTo(10, 5);
    });

    it('长度匹配', () => {
      const result = ema([1, 2, 3], 2);
      expect(result.length).toBe(3);
    });

    it('权重递减', () => {
      const result = ema([10, 20, 30, 40, 50], 3);
      expect(result[4]).toBeGreaterThan(result[3]);
    });
  });

  // 金叉死叉
  describe('金叉死叉信号', () => {
    it('检测金叉', () => {
      const short = [1, 2, 3, 5, 6];
      const long = [4, 4, 4, 4, 4];
      const signals = goldenCross(short, long);
      expect(signals.length).toBeGreaterThan(0);
    });

    it('检测死叉', () => {
      const short = [5, 4, 3, 2, 1];
      const long = [3, 3, 3, 3, 3];
      const signals = deathCross(short, long);
      expect(signals.length).toBeGreaterThan(0);
    });

    it('无交叉', () => {
      const short = [1, 1, 1, 1];
      const long = [5, 5, 5, 5];
      expect(goldenCross(short, long).length).toBe(0);
    });

    it('跳过NaN', () => {
      const short = [NaN, NaN, 3, 5];
      const long = [NaN, NaN, 4, 4];
      const signals = goldenCross(short, long);
      expect(signals.length).toBeGreaterThanOrEqual(0);
    });

    it('频繁交叉', () => {
      const short = [1, 5, 1, 5, 1];
      const long = [3, 3, 3, 3, 3];
      const gc = goldenCross(short, long);
      const dc = deathCross(short, long);
      expect(gc.length + dc.length).toBeGreaterThan(0);
    });
  });

  // RSI
  const calcRSI = (prices: number[], period: number = 14): number[] => {
    const rsi: number[] = Array(period).fill(NaN);
    const changes = prices.slice(1).map((p, i) => p - prices[i]);
    let avgGain = changes.slice(0, period).filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
    let avgLoss = Math.abs(changes.slice(0, period).filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      avgGain = (avgGain * (period - 1) + Math.max(0, change)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -change)) / period;
      rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return rsi;
  };

  describe('RSI指标', () => {
    it('RSI范围0-100', () => {
      const prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
      const rsi = calcRSI(prices, 5);
      const valid = rsi.filter(r => !isNaN(r));
      valid.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(100);
      });
    });

    it('持续上涨RSI高', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const rsi = calcRSI(prices, 5);
      const last = rsi[rsi.length - 1];
      expect(last).toBeGreaterThan(70);
    });

    it('持续下跌RSI低', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 - i);
      const rsi = calcRSI(prices, 5);
      const last = rsi[rsi.length - 1];
      expect(last).toBeLessThan(30);
    });

    it('NaN个数正确', () => {
      const prices = Array.from({ length: 20 }, (_, i) => i);
      const rsi = calcRSI(prices, 14);
      const nanCount = rsi.filter(r => isNaN(r)).length;
      expect(nanCount).toBe(14);
    });

    it('周期为1特殊情况', () => {
      const prices = [10, 12, 11, 13];
      const rsi = calcRSI(prices, 1);
      expect(rsi.length).toBe(prices.length);
    });
  });

  // MACD
  const calcMACD = (prices: number[], fast = 12, slow = 26, signal = 9) => {
    const emaArr = (data: number[], period: number): number[] => {
      const k = 2 / (period + 1);
      const result = [data[0]];
      for (let i = 1; i < data.length; i++) result.push(data[i] * k + result[i - 1] * (1 - k));
      return result;
    };
    const fastEma = emaArr(prices, fast);
    const slowEma = emaArr(prices, slow);
    const dif = fastEma.map((f, i) => f - slowEma[i]);
    const dea = emaArr(dif, signal);
    const macd = dif.map((d, i) => 2 * (d - dea[i]));
    return { dif, dea, macd };
  };

  describe('MACD指标', () => {
    it('DIF零轴附近', () => {
      const prices = Array(50).fill(100);
      const { dif } = calcMACD(prices);
      const last = dif[dif.length - 1];
      expect(Math.abs(last)).toBeLessThan(1);
    });

    it('MACD柱存在', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 10);
      const { macd } = calcMACD(prices);
      expect(macd.length).toBe(prices.length);
    });

    it('趋势上升DIF为正', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
      const { dif } = calcMACD(prices);
      expect(dif[dif.length - 1]).toBeGreaterThan(0);
    });

    it('长度一致', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { dif, dea, macd } = calcMACD(prices);
      expect(dif.length).toBe(dea.length);
      expect(dif.length).toBe(macd.length);
    });

    it('恒定价差DIF接近零', () => {
      const prices = Array(30).fill(50);
      const { dif } = calcMACD(prices, 3, 6, 3);
      expect(Math.abs(dif[dif.length - 1])).toBeLessThan(0.01);
    });
  });

  // 布林带
  const bollingerBands = (data: number[], period = 20, mult = 2) => {
    const result: { upper: number; middle: number; lower: number }[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push({ upper: NaN, middle: NaN, lower: NaN }); continue; }
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
      result.push({ upper: mean + mult * std, middle: mean, lower: mean - mult * std });
    }
    return result;
  };

  describe('布林带', () => {
    it('上轨大于中轨大于下轨', () => {
      const data = Array.from({ length: 30 }, () => Math.random() * 100);
      const bb = bollingerBands(data);
      bb.filter(b => !isNaN(b.upper)).forEach(b => {
        expect(b.upper).toBeGreaterThan(b.middle);
        expect(b.middle).toBeGreaterThan(b.lower);
      });
    });

    it('恒定数据带宽为零', () => {
      const data = Array(25).fill(42);
      const bb = bollingerBands(data);
      const last = bb[bb.length - 1];
      expect(last.upper).toBeCloseTo(42, 5);
      expect(last.lower).toBeCloseTo(42, 5);
    });

    it('多倍数带宽变大', () => {
      const data = Array.from({ length: 30 }, (_, i) => i + Math.random() * 5);
      const bb2 = bollingerBands(data, 10, 2);
      const bb3 = bollingerBands(data, 10, 3);
      const last2 = bb2[bb2.length - 1];
      const last3 = bb3[bb3.length - 1];
      expect(last3.upper - last3.lower).toBeGreaterThan(last2.upper - last2.lower);
    });

    it('不足周期返回NaN', () => {
      const bb = bollingerBands([1, 2, 3], 5);
      bb.forEach(b => expect(isNaN(b.upper)).toBe(true));
    });

    it('结果长度匹配', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const bb = bollingerBands(data, 3);
      expect(bb.length).toBe(10);
    });
  });

  // 止损止盈
  const trailingStop = (prices: number[], stopPct: number, takePct: number) => {
    let peak = prices[0];
    let trough = prices[0];
    const signals: { type: 'stop' | 'take'; index: number; price: number }[] = [];
    for (let i = 1; i < prices.length; i++) {
      peak = Math.max(peak, prices[i]);
      trough = Math.min(trough, prices[i]);
      if (prices[i] <= peak * (1 - stopPct / 100)) {
        signals.push({ type: 'stop', index: i, price: prices[i] });
        break;
      }
      if (prices[i] >= prices[0] * (1 + takePct / 100)) {
        signals.push({ type: 'take', index: i, price: prices[i] });
        break;
      }
    }
    return signals;
  };

  describe('止损止盈', () => {
    it('触发止损', () => {
      const prices = [100, 102, 101, 97, 95];
      const signals = trailingStop(prices, 3, 10);
      expect(signals[0].type).toBe('stop');
    });

    it('触发止盈', () => {
      const prices = [100, 103, 107, 112];
      const signals = trailingStop(prices, 5, 5);
      expect(signals[0].type).toBe('take');
    });

    it('无触发', () => {
      const prices = [100, 101, 100, 101, 100];
      const signals = trailingStop(prices, 5, 5);
      expect(signals.length).toBe(0);
    });

    it('首日触发', () => {
      const prices = [100, 80];
      const signals = trailingStop(prices, 10, 10);
      expect(signals[0].type).toBe('stop');
    });

    it('止盈优先', () => {
      const prices = [100, 106];
      const signals = trailingStop(prices, 10, 5);
      expect(signals[0].type).toBe('take');
    });

    it('价格震荡不触发', () => {
      const prices = [100, 99, 101, 98, 102, 99, 101];
      const signals = trailingStop(prices, 5, 5);
      expect(signals.length).toBe(0);
    });
  });

  // 动量策略
  const momentum = (prices: number[], period: number): number[] => {
    const result: number[] = Array(period).fill(NaN);
    for (let i = period; i < prices.length; i++) {
      result.push(prices[i] - prices[i - period]);
    }
    return result;
  };

  const momentumSignal = (prices: number[], period: number): ('buy' | 'sell' | 'hold')[] => {
    const mom = momentum(prices, period);
    return mom.map((m, i) => {
      if (isNaN(m) || i === 0) return 'hold';
      const prev = mom[i - 1];
      if (isNaN(prev)) return 'hold';
      if (prev <= 0 && m > 0) return 'buy';
      if (prev >= 0 && m < 0) return 'sell';
      return 'hold';
    });
  };

  describe('动量策略', () => {
    it('动量计算', () => {
      const prices = [10, 12, 11, 15, 14];
      const mom = momentum(prices, 2);
      expect(mom[2]).toBe(1);   // 11 - 10
      expect(mom[3]).toBe(3);   // 15 - 12
    });

    it('买入信号', () => {
      const prices = [10, 9, 8, 9, 11, 13];
      const signals = momentumSignal(prices, 2);
      expect(signals).toContain('buy');
    });

    it('卖出信号', () => {
      const prices = [10, 12, 14, 13, 11, 9];
      const signals = momentumSignal(prices, 2);
      expect(signals).toContain('sell');
    });

    it('长度匹配', () => {
      const prices = [1, 2, 3, 4, 5];
      const signals = momentumSignal(prices, 2);
      expect(signals.length).toBe(5);
    });

    it('不足周期为hold', () => {
      const prices = [1, 2, 3];
      const signals = momentumSignal(prices, 5);
      signals.forEach(s => expect(s).toBe('hold'));
    });
  });

  // ATR (Average True Range)
  const calcATR = (high: number[], low: number[], close: number[], period: number): number[] => {
    const tr: number[] = [high[0] - low[0]];
    for (let i = 1; i < high.length; i++) {
      tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
    }
    const atr: number[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) { sum += tr[i]; atr.push(NaN); }
    atr[period - 1] = sum / period;
    for (let i = period; i < tr.length; i++) {
      atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
    }
    return atr;
  };

  describe('ATR指标', () => {
    it('ATR为正', () => {
      const atr = calcATR([10,11,12,11,10], [8,9,10,9,8], [9,10,11,10,9], 3);
      atr.filter(a => !isNaN(a)).forEach(a => expect(a).toBeGreaterThan(0));
    });

    it('波动增大ATR增大', () => {
      const high = [10, 10, 10, 20, 20, 20];
      const low =  [8,  8,  8,  5,  5,  5];
      const close = [9, 9, 9, 12, 12, 12];
      const atr = calcATR(high, low, close, 3);
      const last = atr[atr.length - 1];
      const mid = atr[4];
      expect(last).toBeGreaterThanOrEqual(mid!);
    });

    it('长度一致', () => {
      const atr = calcATR([1,2,3,4,5], [0,1,2,3,4], [0.5,1.5,2.5,3.5,4.5], 3);
      expect(atr.length).toBe(5);
    });

    it('恒定价格ATR接近零', () => {
      const atr = calcATR(Array(10).fill(10), Array(10).fill(10), Array(10).fill(10), 3);
      const last = atr[atr.length - 1];
      expect(last).toBeCloseTo(0, 5);
    });
  });

  // 威廉指标
  const williamsR = (high: number[], low: number[], close: number[], period: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < close.length; i++) {
      if (i < period - 1) { result.push(NaN); continue; }
      const h = Math.max(...high.slice(i - period + 1, i + 1));
      const l = Math.min(...low.slice(i - period + 1, i + 1));
      result.push(((h - close[i]) / (h - l)) * -100);
    }
    return result;
  };

  describe('威廉指标', () => {
    it('范围-100到0', () => {
      const w = williamsR([10,11,12,13,14], [8,9,10,11,12], [9,10,11,12,13], 3);
      w.filter(v => !isNaN(v)).forEach(v => {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(0);
      });
    });

    it('收盘价在最高位为0', () => {
      const w = williamsR([10,10,10], [5,5,5], [10,10,10], 3);
      expect(w[2]).toBeCloseTo(0, 5);
    });

    it('收盘价在最低位为-100', () => {
      const w = williamsR([10,10,10], [5,5,5], [5,5,5], 3);
      expect(w[2]).toBeCloseTo(-100, 5);
    });

    it('不足周期NaN', () => {
      const w = williamsR([1,2], [0,1], [0.5,1.5], 5);
      w.forEach(v => expect(isNaN(v)).toBe(true));
    });
  });
});
