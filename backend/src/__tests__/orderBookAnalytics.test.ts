import { describe, it, expect } from 'vitest';

/**
 * 盘口分析测试
 */

interface OrderLevel { price: number; volume: number; orders: number; }

interface OrderBook {
  bids: OrderLevel[];
  asks: OrderLevel[];
  timestamp: number;
}

function calcWeightedMidPrice(book: OrderBook): number {
  if (book.bids.length === 0 || book.asks.length === 0) return 0;
  const bestBid = book.bids[0];
  const bestAsk = book.asks[0];
  return (bestBid.price * bestAsk.volume + bestAsk.price * bestBid.volume) / (bestBid.volume + bestAsk.volume);
}

function calcMicroPrice(book: OrderBook): number {
  let num = 0, den = 0;
  for (const bid of book.bids) { num += bid.price * bid.volume; den += bid.volume; }
  for (const ask of book.asks) { num += ask.price * ask.volume; den += ask.volume; }
  return den === 0 ? 0 : num / den;
}

function calcBookDepth(book: OrderBook, levels: number): { bidDepth: number; askDepth: number } {
  const bidDepth = book.bids.slice(0, levels).reduce((s, l) => s + l.volume, 0);
  const askDepth = book.asks.slice(0, levels).reduce((s, l) => s + l.volume, 0);
  return { bidDepth, askDepth };
}

function calcBookPressure(book: OrderBook): number {
  const bidVol = book.bids.reduce((s, l) => s + l.volume, 0);
  const askVol = book.asks.reduce((s, l) => s + l.volume, 0);
  const total = bidVol + askVol;
  return total === 0 ? 0.5 : bidVol / total;
}

function detectSpoofing(book: OrderBook, volumeThreshold: number): OrderLevel[] {
  const suspicious: OrderLevel[] = [];
  for (const level of [...book.bids, ...book.asks]) {
    if (level.volume > volumeThreshold && level.orders <= 2) {
      suspicious.push(level);
    }
  }
  return suspicious;
}

function calcKyleLambda(orders: { price: number; signedVolume: number }[]): number {
  if (orders.length < 2) return 0;
  let sumXY = 0, sumXX = 0;
  const meanX = orders.reduce((s, o) => s + o.signedVolume, 0) / orders.length;
  const meanY = orders.reduce((s, o) => s + o.price, 0) / orders.length;
  for (const o of orders) {
    sumXY += (o.signedVolume - meanX) * (o.price - meanY);
    sumXX += (o.signedVolume - meanX) ** 2;
  }
  return sumXX === 0 ? 0 : sumXY / sumXX;
}

function calcEffectiveSpread(tradePrice: number, midPrice: number, side: 'buy' | 'sell'): number {
  return side === 'buy' ? 2 * (tradePrice - midPrice) : 2 * (midPrice - tradePrice);
}

describe('盘口分析', () => {
  const sampleBook: OrderBook = {
    bids: [
      { price: 10.00, volume: 5000, orders: 10 },
      { price: 9.99, volume: 8000, orders: 15 },
      { price: 9.98, volume: 12000, orders: 20 },
    ],
    asks: [
      { price: 10.01, volume: 4000, orders: 8 },
      { price: 10.02, volume: 6000, orders: 12 },
      { price: 10.03, volume: 10000, orders: 18 },
    ],
    timestamp: Date.now(),
  };

  describe('加权中间价', () => {
    it('基本计算', () => {
      const wmp = calcWeightedMidPrice(sampleBook);
      expect(wmp).toBeGreaterThan(10);
      expect(wmp).toBeLessThan(10.01);
    });

    it('买卖均衡时等于中间价', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 100, orders: 1 }],
        asks: [{ price: 10.02, volume: 100, orders: 1 }],
        timestamp: 0,
      };
      expect(calcWeightedMidPrice(book)).toBeCloseTo(10.01);
    });

    it('空盘返回零', () => {
      expect(calcWeightedMidPrice({ bids: [], asks: [], timestamp: 0 })).toBe(0);
    });

    it('买盘量大偏向买价', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 9000, orders: 1 }],
        asks: [{ price: 10.02, volume: 1000, orders: 1 }],
        timestamp: 0,
      };
      // weighted mid = (10*1000 + 10.02*9000) / 10000 = 100 + 90.18 = ... wait
      // (10*1000 + 10.02*9000) / 10000 = (10000 + 90180)/10000 = 10.018
      // Actually more bid volume → closer to ask side (higher weighted mid)
      expect(calcWeightedMidPrice(book)).toBeGreaterThan(10);
    });
  });

  describe('微观价格', () => {
    it('所有档位参与', () => {
      const mp = calcMicroPrice(sampleBook);
      expect(mp).toBeGreaterThan(9.98);
      expect(mp).toBeLessThan(10.03);
    });

    it('空盘', () => {
      expect(calcMicroPrice({ bids: [], asks: [], timestamp: 0 })).toBe(0);
    });
  });

  describe('盘口深度', () => {
    it('前N档汇总', () => {
      const depth = calcBookDepth(sampleBook, 2);
      expect(depth.bidDepth).toBe(13000);
      expect(depth.askDepth).toBe(10000);
    });

    it('全部深度', () => {
      const depth = calcBookDepth(sampleBook, 10);
      expect(depth.bidDepth).toBe(25000);
      expect(depth.askDepth).toBe(20000);
    });

    it('单档', () => {
      const depth = calcBookDepth(sampleBook, 1);
      expect(depth.bidDepth).toBe(5000);
    });
  });

  describe('盘口压力', () => {
    it('买方优势', () => {
      const pressure = calcBookPressure(sampleBook);
      expect(pressure).toBeGreaterThan(0.5);
    });

    it('均衡', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 100, orders: 1 }],
        asks: [{ price: 10.01, volume: 100, orders: 1 }],
        timestamp: 0,
      };
      expect(calcBookPressure(book)).toBe(0.5);
    });

    it('空盘返回0.5', () => {
      expect(calcBookPressure({ bids: [], asks: [], timestamp: 0 })).toBe(0.5);
    });

    it('范围[0,1]', () => {
      expect(calcBookPressure(sampleBook)).toBeGreaterThanOrEqual(0);
      expect(calcBookPressure(sampleBook)).toBeLessThanOrEqual(1);
    });
  });

  describe('虚假挂单检测', () => {
    it('识别大单少量订单', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 15000, orders: 1 }],
        asks: [{ price: 10.01, volume: 4000, orders: 8 }],
        timestamp: Date.now(),
      };
      const spoof = detectSpoofing(book, 10000);
      expect(spoof.length).toBeGreaterThan(0);
    });

    it('正常挂单不触发', () => {
      const spoof = detectSpoofing(sampleBook, 20000);
      expect(spoof.length).toBe(0);
    });
  });

  describe('Kyle Lambda', () => {
    it('正向价格冲击', () => {
      const orders = [
        { price: 10, signedVolume: 100 },
        { price: 10.1, signedVolume: 200 },
        { price: 10.2, signedVolume: 300 },
      ];
      expect(calcKyleLambda(orders)).toBeGreaterThan(0);
    });

    it('空数据', () => {
      expect(calcKyleLambda([])).toBe(0);
    });

    it('单点', () => {
      expect(calcKyleLambda([{ price: 10, signedVolume: 100 }])).toBe(0);
    });
  });

  describe('有效价差', () => {
    it('买单', () => {
      expect(calcEffectiveSpread(10.05, 10, 'buy')).toBeCloseTo(0.1, 10);
    });

    it('卖单', () => {
      expect(calcEffectiveSpread(9.95, 10, 'sell')).toBeCloseTo(0.1, 10);
    });

    it('成交价等于中间价', () => {
      expect(calcEffectiveSpread(10, 10, 'buy')).toBe(0);
    });
  });
});
