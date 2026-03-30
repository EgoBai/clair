import { describe, it, expect } from 'vitest';

describe('时间序列分析引擎V2', () => {
  // 移动平均
  const sma = (data: number[], period: number) => {
    const result: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  };

  const ema = (data: number[], period: number) => {
    if (data.length === 0) return [];
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };

  const wma = (data: number[], period: number) => {
    const result: number[] = [];
    const weights = Array.from({ length: period }, (_, i) => i + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const weighted = slice.reduce((s, v, j) => s + v * weights[j], 0);
      result.push(weighted / totalWeight);
    }
    return result;
  };

  describe('简单移动平均SMA', () => {
    it('基本计算', () => {
      expect(sma([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]);
    });
    it('周期等于长度', () => {
      expect(sma([1, 2, 3], 3)).toEqual([2]);
    });
    it('周期大于长度', () => {
      expect(sma([1, 2], 3)).toEqual([]);
    });
    it('周期为1', () => {
      expect(sma([5, 10, 15], 1)).toEqual([5, 10, 15]);
    });
    it('空数组', () => {
      expect(sma([], 3)).toEqual([]);
    });
  });

  describe('指数移动平均EMA', () => {
    it('首值为原值', () => {
      const result = ema([10, 20, 30], 3);
      expect(result[0]).toBe(10);
    });
    it('长度一致', () => {
      const result = ema([1, 2, 3, 4, 5], 3);
      expect(result.length).toBe(5);
    });
    it('空数组', () => {
      expect(ema([], 3)).toEqual([]);
    });
    it('单值', () => {
      expect(ema([42], 5)).toEqual([42]);
    });
    it('平滑效果', () => {
      const result = ema([10, 100, 10], 2);
      expect(result[1]).toBeGreaterThan(10);
      expect(result[1]).toBeLessThan(100);
    });
  });

  describe('加权移动平均WMA', () => {
    it('基本计算', () => {
      const result = wma([1, 2, 3, 4, 5], 3);
      expect(result.length).toBe(3);
    });
    it('最近值权重更高', () => {
      const result = wma([1, 2, 3], 3);
      expect(result[0]).toBeGreaterThan(2); // (1*1+2*2+3*3)/6 = 14/6
    });
    it('空数组', () => {
      expect(wma([], 3)).toEqual([]);
    });
  });

  // MACD
  const macd = (data: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
    const fastEma = ema(data, fastPeriod);
    const slowEma = ema(data, slowPeriod);
    const macdLine: number[] = [];
    for (let i = 0; i < data.length; i++) {
      macdLine.push(fastEma[i] - slowEma[i]);
    }
    const signal = ema(macdLine, signalPeriod);
    const histogram = macdLine.map((v, i) => v - signal[i]);
    return { macdLine, signal, histogram };
  };

  describe('MACD', () => {
    const data = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 10);

    it('三组数据', () => {
      const result = macd(data);
      expect(result.macdLine.length).toBe(50);
      expect(result.signal.length).toBe(50);
      expect(result.histogram.length).toBe(50);
    });
    it('柱状图=MACD线-信号线', () => {
      const result = macd(data);
      for (let i = 0; i < 50; i++) {
        expect(result.histogram[i]).toBeCloseTo(result.macdLine[i] - result.signal[i], 10);
      }
    });
  });

  // RSI
  const rsi = (data: number[], period = 14) => {
    if (data.length < period + 1) return [];
    const changes = data.slice(1).map((v, i) => v - data[i]);
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
      avgGain = (avgGain * (period - 1) + Math.max(0, change)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -change)) / period;
      result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return result;
  };

  describe('RSI', () => {
    it('值在0-100范围', () => {
      const data = Array.from({ length: 30 }, () => 100 + Math.random() * 20 - 10);
      const result = rsi(data, 14);
      result.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
    });
    it('数据不足', () => {
      expect(rsi([1, 2, 3], 14)).toEqual([]);
    });
    it('全上涨RSI=100', () => {
      const data = Array.from({ length: 30 }, (_, i) => i);
      const result = rsi(data, 14);
      expect(result[result.length - 1]).toBeCloseTo(100, 0);
    });
  });

  // 布林带
  const bollingerBands = (data: number[], period = 20, multiplier = 2) => {
    const smaArr = sma(data, period);
    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = 0; i < smaArr.length; i++) {
      const slice = data.slice(i, i + period);
      const mean = smaArr[i];
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
      upper.push(mean + multiplier * std);
      lower.push(mean - multiplier * std);
    }
    return { middle: smaArr, upper, lower };
  };

  describe('布林带', () => {
    const data = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.3) * 5);

    it('三带数据', () => {
      const result = bollingerBands(data, 10);
      expect(result.middle.length).toBe(result.upper.length);
      expect(result.middle.length).toBe(result.lower.length);
    });
    it('上轨大于中轨', () => {
      const result = bollingerBands(data, 10);
      for (let i = 0; i < result.middle.length; i++) {
        expect(result.upper[i]).toBeGreaterThan(result.middle[i]);
      }
    });
    it('下轨小于中轨', () => {
      const result = bollingerBands(data, 10);
      for (let i = 0; i < result.middle.length; i++) {
        expect(result.lower[i]).toBeLessThan(result.middle[i]);
      }
    });
    it('数据不足', () => {
      const result = bollingerBands([1, 2, 3], 10);
      expect(result.middle.length).toBe(0);
    });
  });

  // ATR
  const atr = (high: number[], low: number[], close: number[], period = 14) => {
    const tr: number[] = [high[0] - low[0]];
    for (let i = 1; i < high.length; i++) {
      tr.push(Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      ));
    }
    return sma(tr, period);
  };

  describe('ATR', () => {
    const high = [110, 112, 115, 113, 116, 118, 120, 119, 121, 123, 125, 124, 126, 128, 130, 129, 131, 133];
    const low = [100, 102, 105, 103, 106, 108, 110, 109, 111, 113, 115, 114, 116, 118, 120, 119, 121, 123];
    const close = [105, 107, 110, 108, 111, 113, 115, 114, 116, 118, 120, 119, 121, 123, 125, 124, 126, 128];

    it('ATR为正', () => {
      const result = atr(high, low, close, 5);
      result.forEach(v => expect(v).toBeGreaterThan(0));
    });
    it('输出长度', () => {
      const result = atr(high, low, close, 5);
      expect(result.length).toBe(high.length - 5 + 1);
    });
  });

  // 价格通道
  const priceChannel = (high: number[], low: number[], period: number) => {
    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = period - 1; i < high.length; i++) {
      upper.push(Math.max(...high.slice(i - period + 1, i + 1)));
      lower.push(Math.min(...low.slice(i - period + 1, i + 1)));
    }
    const middle = upper.map((u, i) => (u + lower[i]) / 2);
    return { upper, lower, middle };
  };

  describe('价格通道', () => {
    const high = [10, 12, 11, 15, 14, 13, 16, 18, 17, 19];
    const low = [8, 9, 8, 12, 11, 10, 13, 15, 14, 16];

    it('上轨大于下轨', () => {
      const result = priceChannel(high, low, 3);
      for (let i = 0; i < result.upper.length; i++) {
        expect(result.upper[i]).toBeGreaterThan(result.lower[i]);
      }
    });
    it('中轨为平均值', () => {
      const result = priceChannel(high, low, 3);
      for (let i = 0; i < result.middle.length; i++) {
        expect(result.middle[i]).toBeCloseTo((result.upper[i] + result.lower[i]) / 2, 10);
      }
    });
    it('输出长度', () => {
      const result = priceChannel(high, low, 5);
      expect(result.upper.length).toBe(high.length - 5 + 1);
    });
  });

  // 动量指标
  const momentum = (data: number[], period: number) => {
    const result: number[] = [];
    for (let i = period; i < data.length; i++) {
      result.push(data[i] - data[i - period]);
    }
    return result;
  };

  describe('动量指标', () => {
    it('基本计算', () => {
      expect(momentum([10, 12, 14, 16, 18], 2)).toEqual([4, 4, 4]);
    });
    it('正负动量', () => {
      const result = momentum([10, 15, 12, 18, 14], 2);
      expect(result[0]).toBe(2); // 12-10
      expect(result[1]).toBe(3); // 18-15 (wait, 18-12=6... no: index 3-1=2→data[3]-data[1]=18-15=3)
    });
    it('周期大于数据', () => {
      expect(momentum([1, 2], 5)).toEqual([]);
    });
    it('空数组', () => {
      expect(momentum([], 3)).toEqual([]);
    });
  });
});
