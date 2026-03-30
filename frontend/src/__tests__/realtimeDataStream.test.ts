import { describe, it, expect } from 'vitest';

// Real-time Data Stream Processing & WebSocket Client Utilities
interface TickData {
  code: string;
  price: number;
  volume: number;
  bidPrice: number[];
  bidVolume: number[];
  askPrice: number[];
  askVolume: number[];
  timestamp: number;
}

interface QuoteUpdate {
  type: 'quote' | 'trade' | 'depth' | 'heartbeat' | 'error';
  data: any;
  seq: number;
  timestamp: number;
}

interface OrderBookLevel {
  price: number;
  volume: number;
  orders: number;
}

interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  midPrice: number;
  imbalance: number;
  timestamp: number;
}

function parseQuoteMessage(raw: string): QuoteUpdate | null {
  try {
    const data = JSON.parse(raw);
    if (!data.type || !data.seq) return null;
    return {
      type: data.type,
      data: data.data || {},
      seq: Number(data.seq),
      timestamp: data.timestamp || Date.now(),
    };
  } catch {
    return null;
  }
}

function processTickBuffer(buffer: TickData[], windowMs = 5000): {
  avgPrice: number;
  vwap: number;
  totalVolume: number;
  tickCount: number;
  priceRange: { min: number; max: number };
  lastPrice: number;
} {
  if (buffer.length === 0) {
    return { avgPrice: 0, vwap: 0, totalVolume: 0, tickCount: 0, priceRange: { min: 0, max: 0 }, lastPrice: 0 };
  }
  const now = Date.now();
  const windowed = buffer.filter(t => now - t.timestamp <= windowMs);
  if (windowed.length === 0) {
    return { avgPrice: 0, vwap: 0, totalVolume: 0, tickCount: 0, priceRange: { min: 0, max: 0 }, lastPrice: 0 };
  }

  let sumPrice = 0, sumPV = 0, totalVol = 0;
  let minPrice = Infinity, maxPrice = -Infinity;

  for (const tick of windowed) {
    sumPrice += tick.price;
    sumPV += tick.price * tick.volume;
    totalVol += tick.volume;
    if (tick.price < minPrice) minPrice = tick.price;
    if (tick.price > maxPrice) maxPrice = tick.price;
  }

  return {
    avgPrice: Math.round(sumPrice / windowed.length * 100) / 100,
    vwap: totalVol > 0 ? Math.round(sumPV / totalVol * 100) / 100 : 0,
    totalVolume: totalVol,
    tickCount: windowed.length,
    priceRange: { min: minPrice, max: maxPrice },
    lastPrice: windowed[windowed.length - 1].price,
  };
}

function buildOrderBook(tick: TickData): OrderBook {
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  for (let i = 0; i < tick.bidPrice.length; i++) {
    if (tick.bidPrice[i] > 0) {
      bids.push({ price: tick.bidPrice[i], volume: tick.bidVolume[i], orders: Math.ceil(tick.bidVolume[i] / 100) });
    }
  }
  for (let i = 0; i < tick.askPrice.length; i++) {
    if (tick.askPrice[i] > 0) {
      asks.push({ price: tick.askPrice[i], volume: tick.askVolume[i], orders: Math.ceil(tick.askVolume[i] / 100) });
    }
  }

  const bestBid = bids.length > 0 ? bids[0].price : 0;
  const bestAsk = asks.length > 0 ? asks[0].price : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const midPrice = bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : tick.price;

  const totalBidVol = bids.reduce((s, b) => s + b.volume, 0);
  const totalAskVol = asks.reduce((s, a) => s + a.volume, 0);
  const imbalance = totalBidVol + totalAskVol > 0
    ? Math.round((totalBidVol - totalAskVol) / (totalBidVol + totalAskVol) * 100) / 100
    : 0;

  return {
    bids: bids.sort((a, b) => b.price - a.price),
    asks: asks.sort((a, b) => a.price - b.price),
    spread: Math.round(spread * 100) / 100,
    midPrice: Math.round(midPrice * 100) / 100,
    imbalance,
    timestamp: tick.timestamp,
  };
}

function detectPriceAnomaly(prices: number[], threshold = 2): { index: number; zscore: number }[] {
  if (prices.length < 3) return [];
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return [];

  const anomalies: { index: number; zscore: number }[] = [];
  for (let i = 0; i < prices.length; i++) {
    const zscore = Math.abs((prices[i] - mean) / stdDev);
    if (zscore > threshold) {
      anomalies.push({ index: i, zscore: Math.round(zscore * 100) / 100 });
    }
  }
  return anomalies;
}

function calculateRollingStats(values: number[], window: number): { mean: number[]; std: number[] } {
  const mean: number[] = [];
  const std: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const m = slice.reduce((a, b) => a + b, 0) / slice.length;
    mean.push(Math.round(m * 10000) / 10000);
    const v = slice.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / slice.length;
    std.push(Math.round(Math.sqrt(v) * 10000) / 10000);
  }
  return { mean, std };
}

function resampleTicks(ticks: TickData[], intervalMs: number): {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
}[] {
  if (ticks.length === 0) return [];
  const buckets = new Map<number, TickData[]>();

  for (const tick of ticks) {
    const bucketKey = Math.floor(tick.timestamp / intervalMs) * intervalMs;
    const list = buckets.get(bucketKey) || [];
    list.push(tick);
    buckets.set(bucketKey, list);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, bucket]) => {
      const prices = bucket.map(t => t.price);
      const volumes = bucket.map(t => t.volume);
      const totalVol = volumes.reduce((a, b) => a + b, 0);
      const pvSum = bucket.reduce((s, t) => s + t.price * t.volume, 0);
      return {
        timestamp: ts,
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: prices[prices.length - 1],
        volume: totalVol,
        vwap: totalVol > 0 ? Math.round(pvSum / totalVol * 100) / 100 : 0,
      };
    });
}

function validateSequence(seq: number[], maxGap = 1): { missing: number[]; duplicates: number[]; isValid: boolean } {
  const missing: number[] = [];
  const duplicates: number[] = [];
  const seen = new Set<number>();

  for (const s of seq) {
    if (seen.has(s)) duplicates.push(s);
    seen.add(s);
  }

  for (let i = 1; i < seq.length; i++) {
    for (let gap = seq[i - 1] + 1; gap < seq[i]; gap++) {
      missing.push(gap);
    }
  }

  return { missing, duplicates, isValid: missing.length === 0 && duplicates.length === 0 };
}

function calculateMicroPrice(bids: OrderBookLevel[], asks: OrderBookLevel[]): number {
  if (bids.length === 0 || asks.length === 0) return 0;
  const bestBid = bids[0];
  const bestAsk = asks[0];
  const totalVol = bestBid.volume + bestAsk.volume;
  if (totalVol === 0) return (bestBid.price + bestAsk.price) / 2;
  return (bestBid.price * bestAsk.volume + bestAsk.price * bestBid.volume) / totalVol;
}

describe('Real-time Data Stream Processing', () => {
  describe('Quote Message Parsing', () => {
    it('should parse valid message', () => {
      const msg = JSON.stringify({ type: 'quote', seq: 1, data: { price: 10 } });
      const parsed = parseQuoteMessage(msg);
      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe('quote');
      expect(parsed!.seq).toBe(1);
    });

    it('should reject invalid JSON', () => {
      expect(parseQuoteMessage('not json')).toBeNull();
    });

    it('should reject missing type', () => {
      expect(parseQuoteMessage(JSON.stringify({ seq: 1 }))).toBeNull();
    });

    it('should reject missing seq', () => {
      expect(parseQuoteMessage(JSON.stringify({ type: 'quote' }))).toBeNull();
    });

    it('should default timestamp', () => {
      const msg = JSON.stringify({ type: 'quote', seq: 1 });
      const parsed = parseQuoteMessage(msg);
      expect(parsed!.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Tick Buffer Processing', () => {
    const now = Date.now();
    const ticks: TickData[] = [
      { code: '600000', price: 10, volume: 100, bidPrice: [], bidVolume: [], askPrice: [], askVolume: [], timestamp: now - 1000 },
      { code: '600000', price: 10.5, volume: 200, bidPrice: [], bidVolume: [], askPrice: [], askVolume: [], timestamp: now - 500 },
      { code: '600000', price: 11, volume: 150, bidPrice: [], bidVolume: [], askPrice: [], askVolume: [], timestamp: now },
    ];

    it('should compute VWAP', () => {
      const result = processTickBuffer(ticks, 5000);
      expect(result.vwap).toBeGreaterThan(0);
      expect(result.totalVolume).toBe(450);
    });

    it('should compute average price', () => {
      const result = processTickBuffer(ticks, 5000);
      expect(result.avgPrice).toBeCloseTo(10.5, 0);
    });

    it('should filter by window', () => {
      const result = processTickBuffer(ticks, 100);
      expect(result.tickCount).toBe(1);
    });

    it('should handle empty buffer', () => {
      const result = processTickBuffer([], 5000);
      expect(result.tickCount).toBe(0);
      expect(result.vwap).toBe(0);
    });

    it('should track price range', () => {
      const result = processTickBuffer(ticks, 5000);
      expect(result.priceRange.min).toBe(10);
      expect(result.priceRange.max).toBe(11);
    });
  });

  describe('Order Book Construction', () => {
    it('should build order book from tick', () => {
      const tick: TickData = {
        code: '600000', price: 10, volume: 100,
        bidPrice: [9.99, 9.98, 9.97], bidVolume: [1000, 2000, 1500],
        askPrice: [10.01, 10.02, 10.03], askVolume: [800, 1200, 900],
        timestamp: Date.now(),
      };
      const book = buildOrderBook(tick);
      expect(book.bids).toHaveLength(3);
      expect(book.asks).toHaveLength(3);
      expect(book.spread).toBeCloseTo(0.02, 2);
      expect(book.midPrice).toBeCloseTo(10, 1);
    });

    it('should compute imbalance', () => {
      const tick: TickData = {
        code: '600000', price: 10, volume: 100,
        bidPrice: [9.99], bidVolume: [10000],
        askPrice: [10.01], askVolume: [1000],
        timestamp: Date.now(),
      };
      const book = buildOrderBook(tick);
      expect(book.imbalance).toBeGreaterThan(0);
    });

    it('should sort bids descending', () => {
      const tick: TickData = {
        code: '600000', price: 10, volume: 100,
        bidPrice: [9.97, 9.99, 9.98], bidVolume: [100, 200, 150],
        askPrice: [], askVolume: [],
        timestamp: Date.now(),
      };
      const book = buildOrderBook(tick);
      expect(book.bids[0].price).toBe(9.99);
      expect(book.bids[1].price).toBe(9.98);
      expect(book.bids[2].price).toBe(9.97);
    });

    it('should sort asks ascending', () => {
      const tick: TickData = {
        code: '600000', price: 10, volume: 100,
        bidPrice: [], bidVolume: [],
        askPrice: [10.03, 10.01, 10.02], askVolume: [100, 200, 150],
        timestamp: Date.now(),
      };
      const book = buildOrderBook(tick);
      expect(book.asks[0].price).toBe(10.01);
    });
  });

  describe('Price Anomaly Detection', () => {
    it('should detect anomalies', () => {
      const prices = [10, 10.1, 10.05, 10.08, 50, 10.02, 10.03];
      const anomalies = detectPriceAnomaly(prices, 2);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].index).toBe(4);
    });

    it('should return empty for stable data', () => {
      const prices = [10, 10.01, 10.02, 9.99, 10.01];
      expect(detectPriceAnomaly(prices, 2)).toHaveLength(0);
    });

    it('should handle insufficient data', () => {
      expect(detectPriceAnomaly([10, 10.5], 2)).toHaveLength(0);
    });

    it('should handle constant values', () => {
      expect(detectPriceAnomaly([10, 10, 10, 10], 2)).toHaveLength(0);
    });
  });

  describe('Rolling Statistics', () => {
    it('should compute rolling mean', () => {
      const values = [1, 2, 3, 4, 5];
      const { mean } = calculateRollingStats(values, 3);
      expect(mean).toHaveLength(5);
      expect(mean[4]).toBeCloseTo(4, 1);
    });

    it('should compute rolling std', () => {
      const values = [1, 2, 3, 4, 5];
      const { std } = calculateRollingStats(values, 3);
      expect(std).toHaveLength(5);
      expect(std[std.length - 1]).toBeGreaterThan(0);
    });

    it('should handle window=1', () => {
      const values = [1, 2, 3];
      const { mean, std } = calculateRollingStats(values, 1);
      expect(mean).toEqual([1, 2, 3]);
      expect(std).toEqual([0, 0, 0]);
    });
  });

  describe('Tick Resampling', () => {
    it('should resample ticks to bars', () => {
      const ticks: TickData[] = [
        { code: '600000', price: 10, volume: 100, bidPrice: [], bidVolume: [], askPrice: [], askVolume: [], timestamp: 1000 },
        { code: '600000', price: 10.5, volume: 200, bidPrice: [], bidVolume: [], askPrice: [], askVolume: [], timestamp: 1500 },
        { code: '600000', price: 11, volume: 150, bidPrice: [], bidVolume: [], askPrice: [], askVolume: [], timestamp: 2500 },
      ];
      const bars = resampleTicks(ticks, 1000);
      expect(bars.length).toBeGreaterThan(0);
      expect(bars[0].open).toBe(10);
      expect(bars[0].close).toBeDefined();
    });

    it('should handle empty ticks', () => {
      expect(resampleTicks([], 1000)).toHaveLength(0);
    });

    it('should compute VWAP per bar', () => {
      const ticks: TickData[] = [
        { code: '600000', price: 10, volume: 100, bidPrice: [], bidVolume: [], askPrice: [], askVolume: [], timestamp: 1000 },
        { code: '600000', price: 11, volume: 200, bidPrice: [], bidVolume: [], askPrice: [], askVolume: [], timestamp: 1000 },
      ];
      const bars = resampleTicks(ticks, 1000);
      expect(bars[0].vwap).toBeGreaterThan(0);
    });
  });

  describe('Sequence Validation', () => {
    it('should detect valid sequence', () => {
      expect(validateSequence([1, 2, 3, 4, 5]).isValid).toBe(true);
    });

    it('should detect missing messages', () => {
      const result = validateSequence([1, 2, 5, 6]);
      expect(result.isValid).toBe(false);
      expect(result.missing).toEqual([3, 4]);
    });

    it('should detect duplicates', () => {
      const result = validateSequence([1, 2, 2, 3]);
      expect(result.isValid).toBe(false);
      expect(result.duplicates).toEqual([2]);
    });

    it('should handle single element', () => {
      expect(validateSequence([1]).isValid).toBe(true);
    });
  });

  describe('Micro Price', () => {
    it('should calculate micro price', () => {
      const bids: OrderBookLevel[] = [{ price: 10, volume: 1000, orders: 10 }];
      const asks: OrderBookLevel[] = [{ price: 10.02, volume: 800, orders: 8 }];
      const mp = calculateMicroPrice(bids, asks);
      expect(mp).toBeGreaterThan(10);
      expect(mp).toBeLessThan(10.02);
    });

    it('should return mid-price for zero volumes', () => {
      const bids: OrderBookLevel[] = [{ price: 10, volume: 0, orders: 0 }];
      const asks: OrderBookLevel[] = [{ price: 10.02, volume: 0, orders: 0 }];
      expect(calculateMicroPrice(bids, asks)).toBeCloseTo(10.01, 2);
    });

    it('should return 0 for empty books', () => {
      expect(calculateMicroPrice([], [])).toBe(0);
    });

    it('should weight by opposing volume', () => {
      const bids: OrderBookLevel[] = [{ price: 10, volume: 100, orders: 1 }];
      const asks: OrderBookLevel[] = [{ price: 10.04, volume: 10000, orders: 100 }];
      const mp = calculateMicroPrice(bids, asks);
      expect(mp).toBeCloseTo(10, 1); // Mostly weighted by ask volume
    });
  });
});
