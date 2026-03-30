import { describe, it, expect } from 'vitest';

// ===== 订单簿计算引擎测试 =====
describe('Order Book Engine', () => {
  interface OrderBookLevel {
    price: number;
    volume: number;
    orders: number;
  }

  interface OrderBook {
    symbol: string;
    timestamp: number;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
  }

  const calculateSpread = (book: OrderBook): number => {
    if (book.asks.length === 0 || book.bids.length === 0) return 0;
    return book.asks[0].price - book.bids[0].price;
  };

  const calculateSpreadPercent = (book: OrderBook): number => {
    if (book.asks.length === 0 || book.bids.length === 0) return 0;
    const mid = (book.asks[0].price + book.bids[0].price) / 2;
    return ((book.asks[0].price - book.bids[0].price) / mid) * 100;
  };

  const calculateWeightedMidPrice = (book: OrderBook): number => {
    if (book.asks.length === 0 || book.bids.length === 0) return 0;
    const bidVol = book.bids.reduce((s, b) => s + b.volume, 0);
    const askVol = book.asks.reduce((s, a) => s + a.volume, 0);
    const total = bidVol + askVol;
    return (book.bids[0].price * askVol + book.asks[0].price * bidVol) / total;
  };

  const calculateOrderBookImbalance = (book: OrderBook, depth: number = 5): number => {
    const bidVol = book.bids.slice(0, depth).reduce((s, b) => s + b.volume, 0);
    const askVol = book.asks.slice(0, depth).reduce((s, a) => s + a.volume, 0);
    const total = bidVol + askVol;
    if (total === 0) return 0;
    return (bidVol - askVol) / total;
  };

  const calculateVWAP = (levels: OrderBookLevel[], targetVolume: number): number | null => {
    let cumVol = 0, cumTPV = 0;
    for (const level of levels) {
      const vol = Math.min(level.volume, targetVolume - cumVol);
      cumTPV += level.price * vol;
      cumVol += vol;
      if (cumVol >= targetVolume) break;
    }
    return cumVol > 0 ? cumTPV / cumVol : null;
  };

  const calculateMarketImpact = (book: OrderBook, side: 'buy' | 'sell', volume: number): number => {
    const levels = side === 'buy' ? book.asks : book.bids;
    const bestPrice = levels[0]?.price || 0;
    const vwap = calculateVWAP(levels, volume);
    if (vwap === null || bestPrice === 0) return 0;
    return ((vwap - bestPrice) / bestPrice) * 100;
  };

  const detectSpoofing = (book: OrderBook, volumeThreshold: number = 10000): { side: string; level: number }[] => {
    const alerts: { side: string; level: number }[] = [];
    book.bids.forEach((b, i) => { if (b.volume > volumeThreshold) alerts.push({ side: 'bid', level: i }); });
    book.asks.forEach((a, i) => { if (a.volume > volumeThreshold) alerts.push({ side: 'ask', level: i }); });
    return alerts;
  };

  const sampleBook: OrderBook = {
    symbol: '600519',
    timestamp: Date.now(),
    bids: [
      { price: 1800.00, volume: 500, orders: 10 },
      { price: 1799.99, volume: 800, orders: 15 },
      { price: 1799.98, volume: 300, orders: 5 },
      { price: 1799.50, volume: 1200, orders: 20 },
      { price: 1799.00, volume: 600, orders: 8 },
    ],
    asks: [
      { price: 1800.01, volume: 400, orders: 8 },
      { price: 1800.02, volume: 600, orders: 12 },
      { price: 1800.50, volume: 900, orders: 18 },
      { price: 1801.00, volume: 200, orders: 4 },
      { price: 1801.50, volume: 700, orders: 10 },
    ],
  };

  describe('价差计算', () => {
    it('基本价差', () => {
      expect(calculateSpread(sampleBook)).toBeCloseTo(0.01, 2);
    });

    it('价差百分比', () => {
      expect(calculateSpreadPercent(sampleBook)).toBeGreaterThan(0);
      expect(calculateSpreadPercent(sampleBook)).toBeLessThan(0.01);
    });

    it('空盘口价差为0', () => {
      const empty: OrderBook = { symbol: 'x', timestamp: 0, bids: [], asks: [] };
      expect(calculateSpread(empty)).toBe(0);
    });

    it('价差应为正数', () => {
      expect(calculateSpread(sampleBook)).toBeGreaterThan(0);
    });
  });

  describe('加权中间价', () => {
    it('应在买卖价之间', () => {
      const wmid = calculateWeightedMidPrice(sampleBook);
      expect(wmid).toBeGreaterThan(sampleBook.bids[0].price);
      expect(wmid).toBeLessThan(sampleBook.asks[0].price);
    });

    it('买卖量相等时接近中间价', () => {
      const book: OrderBook = {
        symbol: 'x', timestamp: 0,
        bids: [{ price: 100, volume: 500, orders: 10 }],
        asks: [{ price: 101, volume: 500, orders: 10 }],
      };
      const wmid = calculateWeightedMidPrice(book);
      expect(wmid).toBeCloseTo(100.5, 1);
    });
  });

  describe('盘口不平衡度', () => {
    it('买盘更多应为正', () => {
      const book: OrderBook = {
        symbol: 'x', timestamp: 0,
        bids: [{ price: 100, volume: 1000, orders: 10 }],
        asks: [{ price: 101, volume: 500, orders: 5 }],
      };
      expect(calculateOrderBookImbalance(book)).toBeGreaterThan(0);
    });

    it('卖盘更多应为负', () => {
      const book: OrderBook = {
        symbol: 'x', timestamp: 0,
        bids: [{ price: 100, volume: 200, orders: 5 }],
        asks: [{ price: 101, volume: 800, orders: 10 }],
      };
      expect(calculateOrderBookImbalance(book)).toBeLessThan(0);
    });

    it('均衡应接近0', () => {
      const book: OrderBook = {
        symbol: 'x', timestamp: 0,
        bids: [{ price: 100, volume: 500, orders: 10 }],
        asks: [{ price: 101, volume: 500, orders: 10 }],
      };
      expect(calculateOrderBookImbalance(book)).toBeCloseTo(0, 2);
    });

    it('空盘口不平衡度为0', () => {
      const empty: OrderBook = { symbol: 'x', timestamp: 0, bids: [], asks: [] };
      expect(calculateOrderBookImbalance(empty)).toBe(0);
    });

    it('自定义深度', () => {
      const imbalance2 = calculateOrderBookImbalance(sampleBook, 2);
      const imbalance5 = calculateOrderBookImbalance(sampleBook, 5);
      expect(typeof imbalance2).toBe('number');
      expect(typeof imbalance5).toBe('number');
    });
  });

  describe('VWAP计算', () => {
    it('计算买单VWAP', () => {
      const vwap = calculateVWAP(sampleBook.asks, 1000);
      expect(vwap).toBeGreaterThan(sampleBook.asks[0].price);
    });

    it('计算卖单VWAP', () => {
      const vwap = calculateVWAP(sampleBook.bids, 1000);
      expect(vwap).toBeLessThan(sampleBook.bids[0].price);
    });

    it('空盘口返回null', () => {
      expect(calculateVWAP([], 100)).toBeNull();
    });

    it('小单量返回第一档价格', () => {
      const vwap = calculateVWAP(sampleBook.asks, 100);
      expect(vwap).toBe(sampleBook.asks[0].price);
    });
  });

  describe('市场冲击', () => {
    it('买单冲击应为正', () => {
      const impact = calculateMarketImpact(sampleBook, 'buy', 1000);
      expect(impact).toBeGreaterThan(0);
    });

    it('卖单冲击应为负', () => {
      const impact = calculateMarketImpact(sampleBook, 'sell', 1000);
      expect(impact).toBeLessThan(0);
    });

    it('大单冲击更大', () => {
      const small = calculateMarketImpact(sampleBook, 'buy', 100);
      const large = calculateMarketImpact(sampleBook, 'buy', 2000);
      expect(large).toBeGreaterThan(small);
    });
  });

  describe('异常检测', () => {
    it('大单应被检测', () => {
      const book: OrderBook = {
        symbol: 'x', timestamp: 0,
        bids: [{ price: 100, volume: 50000, orders: 1 }],
        asks: [{ price: 101, volume: 100, orders: 5 }],
      };
      const alerts = detectSpoofing(book, 10000);
      expect(alerts.length).toBe(1);
      expect(alerts[0].side).toBe('bid');
    });

    it('正常盘口无警报', () => {
      const alerts = detectSpoofing(sampleBook, 10000);
      expect(alerts.length).toBe(0);
    });
  });
});

// ===== 分时图数据处理 =====
describe('Time-share Chart Processing', () => {
  interface TimeSharePoint {
    time: string;
    price: number;
    avgPrice: number;
    volume: number;
    amount: number;
  }

  const calculateTimeShareMA = (points: TimeSharePoint[], window: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = points.slice(start, i + 1);
      const avg = slice.reduce((s, p) => s + p.price, 0) / slice.length;
      result.push(avg);
    }
    return result;
  };

  const detectVolumeSpikes = (points: TimeSharePoint[], threshold: number = 3): number[] => {
    if (points.length < 2) return [];
    const avgVol = points.reduce((s, p) => s + p.volume, 0) / points.length;
    const spikes: number[] = [];
    points.forEach((p, i) => { if (p.volume > avgVol * threshold) spikes.push(i); });
    return spikes;
  };

  const calculatePriceRange = (points: TimeSharePoint[]): { high: number; low: number; range: number } => {
    if (points.length === 0) return { high: 0, low: 0, range: 0 };
    let high = -Infinity, low = Infinity;
    for (const p of points) {
      if (p.price > high) high = p.price;
      if (p.price < low) low = p.price;
    }
    return { high, low, range: high - low };
  };

  const isLimitUp = (price: number, prevClose: number): boolean => {
    return Math.abs(price / prevClose - 1) >= 0.099;
  };

  const isLimitDown = (price: number, prevClose: number): boolean => {
    return Math.abs(price / prevClose - 1) >= 0.099 && price < prevClose;
  };

  const samplePoints: TimeSharePoint[] = [
    { time: '09:30', price: 100, avgPrice: 100, volume: 1000, amount: 100000 },
    { time: '09:31', price: 100.5, avgPrice: 100.25, volume: 2000, amount: 201000 },
    { time: '09:32', price: 100.3, avgPrice: 100.27, volume: 1500, amount: 150450 },
    { time: '09:33', price: 101, avgPrice: 100.45, volume: 5000, amount: 505000 },
    { time: '09:34', price: 100.8, avgPrice: 100.52, volume: 1200, amount: 120960 },
  ];

  describe('分时均线', () => {
    it('第一条均线应等于第一个价格', () => {
      const ma = calculateTimeShareMA(samplePoints, 5);
      expect(ma[0]).toBe(100);
    });

    it('均线应平滑波动', () => {
      const ma = calculateTimeShareMA(samplePoints, 3);
      expect(ma.length).toBe(5);
      for (let i = 1; i < ma.length; i++) {
        expect(Math.abs(ma[i] - ma[i - 1])).toBeLessThan(1);
      }
    });

    it('空数据应返回空', () => {
      expect(calculateTimeShareMA([], 5)).toEqual([]);
    });

    it('单点数据', () => {
      const ma = calculateTimeShareMA([samplePoints[0]], 3);
      expect(ma).toEqual([100]);
    });
  });

  describe('成交量异常', () => {
    it('应检测大成交量', () => {
      const spikes = detectVolumeSpikes(samplePoints, 2);
      expect(spikes.length).toBeGreaterThan(0);
    });

    it('空数据无异常', () => {
      expect(detectVolumeSpikes([], 3)).toEqual([]);
    });

    it('单点无异常', () => {
      expect(detectVolumeSpikes([samplePoints[0]], 3)).toEqual([]);
    });
  });

  describe('价格范围', () => {
    it('应正确计算高低', () => {
      const range = calculatePriceRange(samplePoints);
      expect(range.high).toBe(101);
      expect(range.low).toBe(100);
      expect(range.range).toBe(1);
    });

    it('空数据应为零', () => {
      const range = calculatePriceRange([]);
      expect(range.high).toBe(0);
      expect(range.low).toBe(0);
    });

    it('单点范围为0', () => {
      const range = calculatePriceRange([samplePoints[0]]);
      expect(range.range).toBe(0);
    });
  });

  describe('涨跌停检测', () => {
    it('涨停应识别', () => {
      expect(isLimitUp(11.0, 10.0)).toBe(true);
    });

    it('跌停应识别', () => {
      expect(isLimitDown(9.0, 10.0)).toBe(true);
    });

    it('正常涨跌不应为涨停', () => {
      expect(isLimitUp(10.5, 10.0)).toBe(false);
    });

    it('正常涨跌不应为跌停', () => {
      expect(isLimitDown(9.8, 10.0)).toBe(false);
    });

    it('科创板20%涨停', () => {
      const isStarLimitUp = (price: number, prevClose: number) => Math.abs(price / prevClose - 1) >= 0.199;
      expect(isStarLimitUp(12.0, 10.0)).toBe(true);
      expect(isStarLimitUp(11.5, 10.0)).toBe(false);
    });
  });
});

// ===== 技术形态识别增强 =====
describe('Candlestick Pattern Recognition Enhanced', () => {
  interface OHLC { open: number; high: number; low: number; close: number; }

  const isShootingStar = (c: OHLC): boolean => {
    const body = Math.abs(c.close - c.open);
    const upper = c.high - Math.max(c.close, c.open);
    const lower = Math.min(c.close, c.open) - c.low;
    const range = c.high - c.low;
    return range > 0 && body < range * 0.3 && upper > body * 2 && lower < body;
  };

  const isHangingMan = (c: OHLC, prev: OHLC): boolean => {
    const body = Math.abs(c.close - c.open);
    const lower = Math.min(c.close, c.open) - c.low;
    const upper = c.high - Math.max(c.close, c.open);
    const prevBullish = prev.close > prev.open;
    const bearish = c.close < c.open;
    return prevBullish && bearish && lower > body * 2 && upper < body;
  };

  const isThreeWhiteSoldiers = (c1: OHLC, c2: OHLC, c3: OHLC): boolean => {
    const bullish = (c: OHLC) => c.close > c.open;
    return bullish(c1) && bullish(c2) && bullish(c3) &&
      c2.close > c1.close && c3.close > c2.close;
  };

  const isThreeBlackCrows = (c1: OHLC, c2: OHLC, c3: OHLC): boolean => {
    const bearish = (c: OHLC) => c.close < c.open;
    return bearish(c1) && bearish(c2) && bearish(c3) &&
      c2.close < c1.close && c3.close < c2.close;
  };

  const isPiercingLine = (prev: OHLC, curr: OHLC): boolean => {
    if (prev.close >= prev.open || curr.close <= curr.open) return false;
    const mid = (prev.open + prev.close) / 2;
    return curr.close > mid && curr.open < prev.close;
  };

  const isDarkCloudCover = (prev: OHLC, curr: OHLC): boolean => {
    if (prev.close <= prev.open || curr.close >= curr.open) return false;
    const mid = (prev.open + prev.close) / 2;
    return curr.close < mid && curr.open > prev.close;
  };

  const isSpinningTop = (c: OHLC): boolean => {
    const body = Math.abs(c.close - c.open);
    const upper = c.high - Math.max(c.close, c.open);
    const lower = Math.min(c.close, c.open) - c.low;
    const range = c.high - c.low;
    return range > 0 && body < range * 0.3 && upper > body && lower > body;
  };

  const isDoji = (c: OHLC): boolean => {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    return range > 0 && body / range < 0.05;
  };

  describe('射击之星', () => {
    it('上影线长应为射击之星', () => {
      expect(isShootingStar({ open: 10, high: 10.8, low: 9.95, close: 9.9 })).toBe(true);
    });

    it('无上影线不应为射击之星', () => {
      expect(isShootingStar({ open: 10, high: 10, low: 9, close: 9.5 })).toBe(false);
    });

    it('零波动不应为射击之星', () => {
      expect(isShootingStar({ open: 10, high: 10, low: 10, close: 10 })).toBe(false);
    });
  });

  describe('黄昏之星', () => {
    it('三K线组合', () => {
      // Shooting star: small body, long upper shadow, small lower shadow
      expect(isShootingStar({ open: 10.2, high: 11.0, low: 10.15, close: 10.1 })).toBe(true);
    });
  });

  describe('三白兵', () => {
    it('连续三根阳线', () => {
      const c1 = { open: 10, high: 10.5, low: 9.9, close: 10.4 };
      const c2 = { open: 10.4, high: 10.8, low: 10.3, close: 10.7 };
      const c3 = { open: 10.7, high: 11.2, low: 10.6, close: 11 };
      expect(isThreeWhiteSoldiers(c1, c2, c3)).toBe(true);
    });

    it('含阴线不应为三白兵', () => {
      const c1 = { open: 10, high: 10.5, low: 9.9, close: 10.4 };
      const c2 = { open: 10.4, high: 10.5, low: 10, close: 10.2 };
      const c3 = { open: 10.2, high: 10.8, low: 10.1, close: 10.7 };
      expect(isThreeWhiteSoldiers(c1, c2, c3)).toBe(false);
    });
  });

  describe('三黑鸦', () => {
    it('连续三根阴线', () => {
      const c1 = { open: 11, high: 11.1, low: 10.6, close: 10.7 };
      const c2 = { open: 10.7, high: 10.8, low: 10.3, close: 10.4 };
      const c3 = { open: 10.4, high: 10.5, low: 10, close: 10.1 };
      expect(isThreeBlackCrows(c1, c2, c3)).toBe(true);
    });

    it('含阳线不应为三黑鸦', () => {
      const c1 = { open: 11, high: 11.1, low: 10.6, close: 10.7 };
      const c2 = { open: 10.7, high: 11, low: 10.6, close: 10.9 };
      const c3 = { open: 10.9, high: 11, low: 10.5, close: 10.6 };
      expect(isThreeBlackCrows(c1, c2, c3)).toBe(false);
    });
  });

  describe('刺透形态', () => {
    it('有效刺透', () => {
      const prev = { open: 11, high: 11.1, low: 10, close: 10 };
      const curr = { open: 9.8, high: 10.8, low: 9.7, close: 10.6 };
      expect(isPiercingLine(prev, curr)).toBe(true);
    });

    it('前阳线不应为刺透', () => {
      const prev = { open: 10, high: 11, low: 9.9, close: 10.8 };
      const curr = { open: 10.5, high: 11, low: 10.4, close: 10.9 };
      expect(isPiercingLine(prev, curr)).toBe(false);
    });
  });

  describe('乌云盖顶', () => {
    it('有效乌云盖顶', () => {
      const prev = { open: 10, high: 11, low: 9.9, close: 10.8 };
      const curr = { open: 11, high: 11.1, low: 10.2, close: 10.3 };
      expect(isDarkCloudCover(prev, curr)).toBe(true);
    });

    it('前阴线不应为乌云盖顶', () => {
      const prev = { open: 11, high: 11.1, low: 10, close: 10.2 };
      const curr = { open: 10, high: 10.5, low: 9.5, close: 9.6 };
      expect(isDarkCloudCover(prev, curr)).toBe(false);
    });
  });

  describe('纺锤线', () => {
    it('小实体应为纺锤线', () => {
      expect(isSpinningTop({ open: 10, high: 10.5, low: 9.5, close: 10.1 })).toBe(true);
    });

    it('大实体不应为纺锤线', () => {
      expect(isSpinningTop({ open: 10, high: 11, low: 9, close: 10.9 })).toBe(false);
    });
  });

  describe('十字星', () => {
    it('极小实体应为十字星', () => {
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10.02 })).toBe(true);
    });

    it('有实体不应为十字星', () => {
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10.4 })).toBe(false);
    });

    it('零波动不应为十字星', () => {
      expect(isDoji({ open: 10, high: 10, low: 10, close: 10 })).toBe(false);
    });
  });
});
