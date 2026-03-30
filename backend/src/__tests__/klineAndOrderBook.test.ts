import { describe, it, expect } from 'vitest';

// ===== K线重采样与数据转换测试 =====
describe('KLine Resampling & Data Transform', () => {
  interface KLine {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    turnover: number;
  }

  const resample = (data: KLine[], factor: number): KLine[] => {
    const result: KLine[] = [];
    for (let i = 0; i < data.length; i += factor) {
      const chunk = data.slice(i, i + factor);
      if (chunk.length === 0) continue;
      result.push({
        time: chunk[0].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map(c => c.high)),
        low: Math.min(...chunk.map(c => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, c) => s + c.volume, 0),
        turnover: chunk.reduce((s, c) => s + c.turnover, 0),
      });
    }
    return result;
  };

  const calcChange = (k: KLine): number => k.open !== 0 ? ((k.close - k.open) / k.open) * 100 : 0;

  const calcAmplitude = (k: KLine): number => k.open !== 0 ? ((k.high - k.low) / k.open) * 100 : 0;

  const isLimitUp = (k: KLine, prevClose: number, limit: number = 10): boolean => {
    return prevClose > 0 && ((k.close - prevClose) / prevClose) * 100 >= limit - 0.01;
  };

  const isLimitDown = (k: KLine, prevClose: number, limit: number = 10): boolean => {
    return prevClose > 0 && ((k.close - prevClose) / prevClose) * 100 <= -(limit - 0.01);
  };

  const calcAveragePrice = (k: KLine): number => k.volume > 0 ? k.turnover / k.volume : 0;

  const generateSampleKLines = (count: number): KLine[] => {
    let price = 100;
    return Array.from({ length: count }, (_, i) => {
      const change = (Math.random() - 0.5) * 4;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random();
      const low = Math.min(open, close) - Math.random();
      price = close;
      return {
        time: `2026-0${Math.floor(i / 20) + 1}-${String((i % 20) + 1).padStart(2, '0')}`,
        open, high, low, close,
        volume: Math.floor(100000 + Math.random() * 50000),
        turnover: Math.floor(price * 100000 + Math.random() * 50000),
      };
    });
  };

  describe('重采样', () => {
    it('2倍重采样', () => {
      const data = generateSampleKLines(10);
      const resampled = resample(data, 2);
      expect(resampled.length).toBe(5);
    });

    it('重采样首根open应为原始首根', () => {
      const data = generateSampleKLines(6);
      const resampled = resample(data, 3);
      expect(resampled[0].open).toBe(data[0].open);
    });

    it('重采样末根close应为原始末根', () => {
      const data = generateSampleKLines(6);
      const resampled = resample(data, 3);
      expect(resampled[1].close).toBe(data[5].close);
    });

    it('空数据应返回空', () => {
      expect(resample([], 2)).toEqual([]);
    });

    it('不足factor应返回一根', () => {
      const data = generateSampleKLines(1);
      const resampled = resample(data, 5);
      expect(resampled.length).toBe(1);
    });

    it('重采样high应为区间最高', () => {
      const data: KLine[] = [
        { time: '1', open: 10, high: 11, low: 9, close: 10.5, volume: 100, turnover: 1000 },
        { time: '2', open: 10.5, high: 12, low: 10, close: 11, volume: 200, turnover: 2000 },
      ];
      const resampled = resample(data, 2);
      expect(resampled[0].high).toBe(12);
      expect(resampled[0].low).toBe(9);
    });

    it('重采样volume应累加', () => {
      const data: KLine[] = [
        { time: '1', open: 10, high: 10, low: 10, close: 10, volume: 100, turnover: 1000 },
        { time: '2', open: 10, high: 10, low: 10, close: 10, volume: 200, turnover: 2000 },
      ];
      const resampled = resample(data, 2);
      expect(resampled[0].volume).toBe(300);
      expect(resampled[0].turnover).toBe(3000);
    });
  });

  describe('涨跌幅', () => {
    it('上涨', () => {
      expect(calcChange({ time: '', open: 100, high: 110, low: 95, close: 105, volume: 0, turnover: 0 })).toBeCloseTo(5);
    });

    it('下跌', () => {
      expect(calcChange({ time: '', open: 100, high: 100, low: 90, close: 95, volume: 0, turnover: 0 })).toBeCloseTo(-5);
    });

    it('open=0应返回0', () => {
      expect(calcChange({ time: '', open: 0, high: 0, low: 0, close: 0, volume: 0, turnover: 0 })).toBe(0);
    });

    it('振幅', () => {
      expect(calcAmplitude({ time: '', open: 100, high: 110, low: 90, close: 100, volume: 0, turnover: 0 })).toBeCloseTo(20);
    });
  });

  describe('涨跌停', () => {
    it('涨停', () => {
      expect(isLimitUp({ time: '', open: 100, high: 110, low: 100, close: 110, volume: 0, turnover: 0 }, 100)).toBe(true);
    });

    it('跌停', () => {
      expect(isLimitDown({ time: '', open: 100, high: 100, low: 90, close: 90, volume: 0, turnover: 0 }, 100)).toBe(true);
    });

    it('未涨停', () => {
      expect(isLimitUp({ time: '', open: 100, high: 105, low: 100, close: 105, volume: 0, turnover: 0 }, 100)).toBe(false);
    });

    it('创业板20%涨停', () => {
      expect(isLimitUp({ time: '', open: 100, high: 120, low: 100, close: 120, volume: 0, turnover: 0 }, 100, 20)).toBe(true);
    });

    it('昨收为0不应判断', () => {
      expect(isLimitUp({ time: '', open: 0, high: 0, low: 0, close: 0, volume: 0, turnover: 0 }, 0)).toBe(false);
    });
  });

  describe('均价', () => {
    it('应正确计算', () => {
      expect(calcAveragePrice({ time: '', open: 0, high: 0, low: 0, close: 0, volume: 1000, turnover: 15000 })).toBeCloseTo(15);
    });

    it('成交量为0应返回0', () => {
      expect(calcAveragePrice({ time: '', open: 0, high: 0, low: 0, close: 0, volume: 0, turnover: 100 })).toBe(0);
    });
  });
});

// ===== 委托单簿分析测试 =====
describe('Order Book Analysis', () => {
  interface OrderLevel {
    price: number;
    volume: number;
  }

  interface OrderBook {
    symbol: string;
    timestamp: number;
    bids: OrderLevel[];
    asks: OrderLevel[];
  }

  const calcSpread = (ob: OrderBook): number => {
    if (ob.asks.length === 0 || ob.bids.length === 0) return 0;
    return ob.asks[0].price - ob.bids[0].price;
  };

  const calcImbalance = (ob: OrderBook): number => {
    const bidVol = ob.bids.reduce((s, b) => s + b.volume, 0);
    const askVol = ob.asks.reduce((s, a) => s + a.volume, 0);
    const total = bidVol + askVol;
    return total > 0 ? (bidVol - askVol) / total : 0;
  };

  const calcWeightedMid = (ob: OrderBook): number => {
    if (ob.asks.length === 0 || ob.bids.length === 0) return 0;
    const bidVol = ob.bids[0].volume;
    const askVol = ob.asks[0].volume;
    const total = bidVol + askVol;
    return total > 0 ? (ob.bids[0].price * askVol + ob.asks[0].price * bidVol) / total : 0;
  };

  const calcDepth = (ob: OrderBook, levels: number): { bidDepth: number; askDepth: number } => {
    return {
      bidDepth: ob.bids.slice(0, levels).reduce((s, b) => s + b.volume, 0),
      askDepth: ob.asks.slice(0, levels).reduce((s, a) => s + a.volume, 0),
    };
  };

  const sampleOB: OrderBook = {
    symbol: '600519',
    timestamp: Date.now(),
    bids: [
      { price: 1850, volume: 1000 },
      { price: 1849, volume: 2000 },
      { price: 1848, volume: 1500 },
      { price: 1847, volume: 3000 },
      { price: 1846, volume: 2500 },
    ],
    asks: [
      { price: 1851, volume: 800 },
      { price: 1852, volume: 1200 },
      { price: 1853, volume: 900 },
      { price: 1854, volume: 1100 },
      { price: 1855, volume: 600 },
    ],
  };

  it('价差计算', () => {
    expect(calcSpread(sampleOB)).toBe(1);
  });

  it('买卖不平衡应-1到1', () => {
    const imbalance = calcImbalance(sampleOB);
    expect(imbalance).toBeGreaterThan(-1);
    expect(imbalance).toBeLessThan(1);
  });

  it('加权中间价应在买卖之间', () => {
    const mid = calcWeightedMid(sampleOB);
    expect(mid).toBeGreaterThan(sampleOB.bids[0].price);
    expect(mid).toBeLessThan(sampleOB.asks[0].price);
  });

  it('深度计算', () => {
    const depth = calcDepth(sampleOB, 3);
    expect(depth.bidDepth).toBe(4500);
    expect(depth.askDepth).toBe(2900);
  });

  it('空盘口价差应为0', () => {
    const empty: OrderBook = { symbol: '', timestamp: 0, bids: [], asks: [] };
    expect(calcSpread(empty)).toBe(0);
    expect(calcImbalance(empty)).toBe(0);
  });

  it('买盘多应不平衡>0', () => {
    const heavyBids: OrderBook = {
      symbol: 'x', timestamp: 0,
      bids: [{ price: 100, volume: 10000 }],
      asks: [{ price: 101, volume: 100 }],
    };
    expect(calcImbalance(heavyBids)).toBeGreaterThan(0);
  });

  it('卖盘多应不平衡<0', () => {
    const heavyAsks: OrderBook = {
      symbol: 'x', timestamp: 0,
      bids: [{ price: 100, volume: 100 }],
      asks: [{ price: 101, volume: 10000 }],
    };
    expect(calcImbalance(heavyAsks)).toBeLessThan(0);
  });

  it('5档深度', () => {
    const depth = calcDepth(sampleOB, 5);
    expect(depth.bidDepth).toBe(10000);
    expect(depth.askDepth).toBe(4600);
  });

  it('买盘深度应大于卖盘（本例）', () => {
    const depth = calcDepth(sampleOB, 5);
    expect(depth.bidDepth).toBeGreaterThan(depth.askDepth);
  });

  it('level=0深度应为0', () => {
    const depth = calcDepth(sampleOB, 0);
    expect(depth.bidDepth).toBe(0);
    expect(depth.askDepth).toBe(0);
  });
});
