import { describe, it, expect } from 'vitest';

// 图表数据处理引擎测试
describe('图表数据处理引擎', () => {
  interface OHLCV {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }

  // K线聚合 (分钟→日线)
  function aggregateKlines(bars: OHLCV[], groupSize: number): OHLCV[] {
    const result: OHLCV[] = [];
    for (let i = 0; i < bars.length; i += groupSize) {
      const chunk = bars.slice(i, i + groupSize);
      if (chunk.length === 0) continue;
      result.push({
        time: chunk[0].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map(c => c.high)),
        low: Math.min(...chunk.map(c => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, c) => s + c.volume, 0),
      });
    }
    return result;
  }

  // VWAP计算
  function calculateVWAP(bars: OHLCV[]): number[] {
    let cumTPV = 0, cumVol = 0;
    return bars.map(b => {
      const tp = (b.high + b.low + b.close) / 3;
      cumTPV += tp * b.volume;
      cumVol += b.volume;
      return cumVol === 0 ? tp : cumTPV / cumVol;
    });
  }

  // 成交量分布
  function volumeProfile(bars: OHLCV[], bins: number = 10): { price: number; volume: number }[] {
    const minPrice = Math.min(...bars.map(b => b.low));
    const maxPrice = Math.max(...bars.map(b => b.high));
    const binSize = (maxPrice - minPrice) / bins;
    if (binSize === 0) return [{ price: minPrice, volume: bars.reduce((s, b) => s + b.volume, 0) }];

    const profile: Map<number, number> = new Map();
    for (const b of bars) {
      const midPrice = (b.high + b.low) / 2;
      const binIdx = Math.min(Math.floor((midPrice - minPrice) / binSize), bins - 1);
      const binPrice = minPrice + binIdx * binSize + binSize / 2;
      profile.set(binPrice, (profile.get(binPrice) || 0) + b.volume);
    }
    return Array.from(profile.entries())
      .map(([price, volume]) => ({ price, volume }))
      .sort((a, b) => a.price - b.price);
  }

  // 价格通道
  function priceChannel(bars: OHLCV[], period: number): { upper: number; middle: number; lower: number }[] {
    return bars.map((_, i) => {
      if (i < period - 1) return { upper: 0, middle: 0, lower: 0 };
      const slice = bars.slice(i - period + 1, i + 1);
      const upper = Math.max(...slice.map(b => b.high));
      const lower = Math.min(...slice.map(b => b.low));
      return { upper, middle: (upper + lower) / 2, lower };
    });
  }

  // K线着色 (涨红跌绿)
  function klineColor(bar: OHLCV): string {
    if (bar.close > bar.open) return '#ef4444'; // 红涨
    if (bar.close < bar.open) return '#22c55e'; // 绿跌
    return '#9ca3af'; // 平盘灰
  }

  // 均线交叉信号
  function maCrossSignals(fast: (number | null)[], slow: (number | null)[]): ('buy' | 'sell' | null)[] {
    return fast.map((f, i) => {
      if (f === null || slow[i] === null || i === 0) return null;
      if (fast[i - 1] === null || slow[i - 1] === null) return null;
      const prevF = fast[i - 1]!, prevS = slow[i - 1]!;
      if (prevF <= prevS && f! > slow[i]!) return 'buy';
      if (prevF >= prevS && f! < slow[i]!) return 'sell';
      return null;
    });
  }

  // MACD柱状图
  function macdHistogram(dif: number[], dea: number[]): number[] {
    return dif.map((d, i) => (d - dea[i]) * 2);
  }

  // Bollinger带宽
  function bollingerBandwidth(upper: number[], lower: number[], middle: number[]): number[] {
    return middle.map((m, i) => m === 0 ? 0 : (upper[i] - lower[i]) / m * 100);
  }

  // 数据插值 (线性)
  function linearInterpolate(data: (number | null)[]): number[] {
    const result = [...data] as (number | null)[];
    for (let i = 0; i < result.length; i++) {
      if (result[i] !== null) continue;
      let prevIdx = -1, nextIdx = -1;
      for (let j = i - 1; j >= 0; j--) { if (result[j] !== null) { prevIdx = j; break; } }
      for (let j = i + 1; j < result.length; j++) { if (result[j] !== null) { nextIdx = j; break; } }
      if (prevIdx >= 0 && nextIdx >= 0) {
        const ratio = (i - prevIdx) / (nextIdx - prevIdx);
        result[i] = result[prevIdx]! + ratio * (result[nextIdx]! - result[prevIdx]!);
      } else if (prevIdx >= 0) {
        result[i] = result[prevIdx];
      } else if (nextIdx >= 0) {
        result[i] = result[nextIdx];
      } else {
        result[i] = 0;
      }
    }
    return result as number[];
  }

  describe('K线聚合', () => {
    const bars: OHLCV[] = [
      { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 200 },
      { time: 3, open: 12, high: 14, low: 11, close: 13, volume: 150 },
      { time: 4, open: 13, high: 15, low: 12, close: 14, volume: 250 },
    ];

    it('2根聚合为2组', () => {
      const agg = aggregateKlines(bars, 2);
      expect(agg).toHaveLength(2);
    });

    it('取组内最高high', () => {
      const agg = aggregateKlines(bars, 2);
      expect(agg[0].high).toBe(13);
    });

    it('取组内最低low', () => {
      const agg = aggregateKlines(bars, 2);
      expect(agg[0].low).toBe(9);
    });

    it('取首根open和末根close', () => {
      const agg = aggregateKlines(bars, 2);
      expect(agg[0].open).toBe(10);
      expect(agg[0].close).toBe(12);
    });

    it('volume求和', () => {
      const agg = aggregateKlines(bars, 2);
      expect(agg[0].volume).toBe(300);
    });
  });

  describe('VWAP', () => {
    it('返回与输入等长', () => {
      const bars: OHLCV[] = [
        { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 200 },
      ];
      expect(calculateVWAP(bars)).toHaveLength(2);
    });

    it('VWAP单调变化(在趋势中)', () => {
      const bars: OHLCV[] = Array.from({ length: 10 }, (_, i) => ({
        time: i, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000,
      }));
      const vwap = calculateVWAP(bars);
      for (let i = 1; i < vwap.length; i++) {
        expect(vwap[i]).toBeGreaterThan(vwap[i - 1]);
      }
    });

    it('零成交量用典型价', () => {
      const bars: OHLCV[] = [{ time: 1, open: 10, high: 12, low: 8, close: 10, volume: 0 }];
      const vwap = calculateVWAP(bars);
      expect(vwap[0]).toBeCloseTo(10, 1); // (12+8+10)/3
    });
  });

  describe('成交量分布', () => {
    it('返回分箱数据', () => {
      const bars: OHLCV[] = [
        { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { time: 2, open: 11, high: 14, low: 10, close: 13, volume: 200 },
      ];
      const profile = volumeProfile(bars, 5);
      expect(profile.length).toBeGreaterThan(0);
    });

    it('每个分箱有price和volume', () => {
      const bars: OHLCV[] = [{ time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 }];
      const profile = volumeProfile(bars, 3);
      profile.forEach(p => {
        expect(p).toHaveProperty('price');
        expect(p).toHaveProperty('volume');
        expect(p.volume).toBeGreaterThanOrEqual(0);
      });
    });

    it('总成交量守恒', () => {
      const bars: OHLCV[] = [
        { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { time: 2, open: 11, high: 14, low: 10, close: 13, volume: 200 },
        { time: 3, open: 13, high: 15, low: 12, close: 14, volume: 150 },
      ];
      const totalVol = bars.reduce((s, b) => s + b.volume, 0);
      const profile = volumeProfile(bars, 10);
      const profileVol = profile.reduce((s, p) => s + p.volume, 0);
      expect(profileVol).toBe(totalVol);
    });
  });

  describe('价格通道', () => {
    const bars: OHLCV[] = Array.from({ length: 10 }, (_, i) => ({
      time: i, open: 100 + i, high: 102 + i, low: 98 + i, close: 101 + i, volume: 1000,
    }));

    it('前period-1个为0', () => {
      const channel = priceChannel(bars, 5);
      expect(channel[0].upper).toBe(0);
      expect(channel[3].upper).toBe(0);
    });

    it('upper >= middle >= lower', () => {
      const channel = priceChannel(bars, 5);
      for (let i = 4; i < channel.length; i++) {
        expect(channel[i].upper).toBeGreaterThanOrEqual(channel[i].middle);
        expect(channel[i].middle).toBeGreaterThanOrEqual(channel[i].lower);
      }
    });
  });

  describe('K线着色', () => {
    it('阳线红色', () => {
      expect(klineColor({ time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 })).toBe('#ef4444');
    });

    it('阴线绿色', () => {
      expect(klineColor({ time: 1, open: 11, high: 12, low: 9, close: 10, volume: 100 })).toBe('#22c55e');
    });

    it('十字星灰色', () => {
      expect(klineColor({ time: 1, open: 10, high: 12, low: 9, close: 10, volume: 100 })).toBe('#9ca3af');
    });
  });

  describe('均线交叉信号', () => {
    it('金叉返回buy', () => {
      const fast = [null, 9, 11];
      const slow = [null, 10, 10];
      const signals = maCrossSignals(fast, slow);
      expect(signals[2]).toBe('buy');
    });

    it('死叉返回sell', () => {
      const fast = [null, 11, 9];
      const slow = [null, 10, 10];
      const signals = maCrossSignals(fast, slow);
      expect(signals[2]).toBe('sell');
    });

    it('无交叉返回null', () => {
      const fast = [null, 11, 12];
      const slow = [null, 10, 10];
      const signals = maCrossSignals(fast, slow);
      expect(signals[2]).toBeNull();
    });
  });

  describe('MACD柱状图', () => {
    it('DIF>DEA为正', () => {
      expect(macdHistogram([2], [1])[0]).toBe(2);
    });

    it('DIF<DEA为负', () => {
      expect(macdHistogram([1], [2])[0]).toBe(-2);
    });
  });

  describe('布林带宽', () => {
    it('带宽为百分比', () => {
      const bw = bollingerBandwidth([110], [90], [100]);
      expect(bw[0]).toBeCloseTo(20, 5); // (110-90)/100*100
    });

    it('中线为0时返回0', () => {
      expect(bollingerBandwidth([10], [-10], [0])[0]).toBe(0);
    });
  });

  describe('线性插值', () => {
    it('无null返回不变', () => {
      const data = [1, 2, 3, 4, 5];
      expect(linearInterpolate(data)).toEqual([1, 2, 3, 4, 5]);
    });

    it('中间null被填充', () => {
      const data = [1, null, 3];
      const result = linearInterpolate(data);
      expect(result[1]).toBe(2);
    });

    it('多个null线性填充', () => {
      const data = [0, null, null, 3];
      const result = linearInterpolate(data);
      expect(result[1]).toBeCloseTo(1, 5);
      expect(result[2]).toBeCloseTo(2, 5);
    });

    it('头部null用首个值填充', () => {
      const data = [null, null, 5];
      const result = linearInterpolate(data);
      expect(result[0]).toBe(5);
    });

    it('尾部null用末值填充', () => {
      const data = [5, null, null];
      const result = linearInterpolate(data);
      expect(result[2]).toBe(5);
    });
  });
});
