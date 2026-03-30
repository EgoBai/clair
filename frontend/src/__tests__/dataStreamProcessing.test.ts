import { describe, it, expect } from 'vitest';

// Data Stream Processing Logic
interface Tick { symbol: string; price: number; volume: number; timestamp: number }
interface OHLC { open: number; high: number; low: number; close: number; volume: number; timestamp: number }

function aggregateTicks(ticks: Tick[], intervalMs: number): OHLC[] {
  if (ticks.length === 0) return [];
  const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
  const buckets = new Map<number, Tick[]>();
  
  for (const tick of sorted) {
    const bucketKey = Math.floor(tick.timestamp / intervalMs) * intervalMs;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)!.push(tick);
  }
  
  return Array.from(buckets.entries()).sort(([a], [b]) => a - b).map(([ts, ticks]) => ({
    open: ticks[0].price,
    high: Math.max(...ticks.map(t => t.price)),
    low: Math.min(...ticks.map(t => t.price)),
    close: ticks[ticks.length - 1].price,
    volume: ticks.reduce((sum, t) => sum + t.volume, 0),
    timestamp: ts
  }));
}

function calculateVWAP(ticks: Tick[]): number {
  if (ticks.length === 0) return 0;
  let totalPV = 0, totalV = 0;
  for (const tick of ticks) {
    totalPV += tick.price * tick.volume;
    totalV += tick.volume;
  }
  return totalV === 0 ? 0 : totalPV / totalV;
}

function detectVolumeSpike(ticks: Tick[], windowSize: number, threshold: number): number[] {
  const spikes: number[] = [];
  for (let i = windowSize; i < ticks.length; i++) {
    const window = ticks.slice(i - windowSize, i);
    const avg = window.reduce((sum, t) => sum + t.volume, 0) / windowSize;
    if (ticks[i].volume > avg * threshold) spikes.push(i);
  }
  return spikes;
}

function calculateOrderImbalance(buys: Tick[], sells: Tick[]): number {
  const buyVol = buys.reduce((sum, t) => sum + t.volume, 0);
  const sellVol = sells.reduce((sum, t) => sum + t.volume, 0);
  const total = buyVol + sellVol;
  return total === 0 ? 0 : (buyVol - sellVol) / total; // -1 to 1
}

function resampleOHLC(data: OHLC[], factor: number): OHLC[] {
  const result: OHLC[] = [];
  for (let i = 0; i < data.length; i += factor) {
    const chunk = data.slice(i, i + factor);
    if (chunk.length === 0) continue;
    result.push({
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      timestamp: chunk[0].timestamp
    });
  }
  return result;
}

function calculateRealizedVolatility(prices: number[], window: number = 20): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < window) { result.push(null); continue; }
    const returns: number[] = [];
    for (let j = i - window + 1; j <= i; j++) {
      if (prices[j - 1] > 0) returns.push(Math.log(prices[j] / prices[j - 1]));
    }
    if (returns.length === 0) { result.push(null); continue; }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    result.push(Math.sqrt(variance * 252)); // annualized
  }
  return result;
}

describe('Data Stream Processing', () => {
  const makeTicks = (count: number, basePrice: number = 100): Tick[] =>
    Array.from({ length: count }, (_, i) => ({
      symbol: 'TEST',
      price: basePrice + Math.random() * 2 - 1,
      volume: 100 + Math.floor(Math.random() * 900),
      timestamp: 1000000 + i * 1000
    }));

  describe('Tick Aggregation', () => {
    it('should aggregate ticks into OHLC bars', () => {
      const ticks: Tick[] = [
        { symbol: 'T', price: 10, volume: 100, timestamp: 1000 },
        { symbol: 'T', price: 12, volume: 200, timestamp: 1500 },
        { symbol: 'T', price: 11, volume: 150, timestamp: 1800 },
      ];
      const bars = aggregateTicks(ticks, 1000);
      expect(bars).toHaveLength(1);
      expect(bars[0].open).toBe(10);
      expect(bars[0].high).toBe(12);
      expect(bars[0].low).toBe(10);
      expect(bars[0].close).toBe(11);
      expect(bars[0].volume).toBe(450);
    });

    it('should split across intervals', () => {
      const ticks: Tick[] = [
        { symbol: 'T', price: 10, volume: 100, timestamp: 500 },
        { symbol: 'T', price: 12, volume: 200, timestamp: 1500 },
      ];
      const bars = aggregateTicks(ticks, 1000);
      expect(bars).toHaveLength(2);
    });

    it('should return empty for no ticks', () => {
      expect(aggregateTicks([], 1000)).toEqual([]);
    });

    it('should handle unsorted ticks', () => {
      const ticks: Tick[] = [
        { symbol: 'T', price: 12, volume: 200, timestamp: 1500 },
        { symbol: 'T', price: 10, volume: 100, timestamp: 500 },
      ];
      const bars = aggregateTicks(ticks, 1000);
      expect(bars[0].open).toBe(10);
    });

    it('should handle single tick', () => {
      const ticks: Tick[] = [{ symbol: 'T', price: 10, volume: 100, timestamp: 1000 }];
      const bars = aggregateTicks(ticks, 1000);
      expect(bars).toHaveLength(1);
      expect(bars[0].open).toBe(10);
      expect(bars[0].close).toBe(10);
    });
  });

  describe('VWAP', () => {
    it('should calculate correct VWAP', () => {
      const ticks: Tick[] = [
        { symbol: 'T', price: 10, volume: 100, timestamp: 1 },
        { symbol: 'T', price: 20, volume: 100, timestamp: 2 },
      ];
      expect(calculateVWAP(ticks)).toBe(15);
    });

    it('should weight by volume', () => {
      const ticks: Tick[] = [
        { symbol: 'T', price: 10, volume: 300, timestamp: 1 },
        { symbol: 'T', price: 20, volume: 100, timestamp: 2 },
      ];
      expect(calculateVWAP(ticks)).toBeCloseTo(12.5, 1);
    });

    it('should return 0 for empty', () => {
      expect(calculateVWAP([])).toBe(0);
    });

    it('should return 0 for zero volume', () => {
      const ticks: Tick[] = [{ symbol: 'T', price: 10, volume: 0, timestamp: 1 }];
      expect(calculateVWAP(ticks)).toBe(0);
    });
  });

  describe('Volume Spike Detection', () => {
    it('should detect volume spikes', () => {
      const ticks: Tick[] = [
        { symbol: 'T', price: 10, volume: 100, timestamp: 1 },
        { symbol: 'T', price: 10, volume: 100, timestamp: 2 },
        { symbol: 'T', price: 10, volume: 100, timestamp: 3 },
        { symbol: 'T', price: 10, volume: 1000, timestamp: 4 }, // spike
      ];
      const spikes = detectVolumeSpike(ticks, 3, 3);
      expect(spikes).toContain(3);
    });

    it('should not detect spikes below threshold', () => {
      const ticks: Tick[] = [
        { symbol: 'T', price: 10, volume: 100, timestamp: 1 },
        { symbol: 'T', price: 10, volume: 100, timestamp: 2 },
        { symbol: 'T', price: 10, volume: 200, timestamp: 3 },
      ];
      expect(detectVolumeSpike(ticks, 2, 5)).toHaveLength(0);
    });

    it('should return empty for insufficient data', () => {
      expect(detectVolumeSpike([{ symbol: 'T', price: 10, volume: 100, timestamp: 1 }], 10, 2)).toHaveLength(0);
    });
  });

  describe('Order Imbalance', () => {
    it('should return positive for buy heavy', () => {
      const buys: Tick[] = [{ symbol: 'T', price: 10, volume: 300, timestamp: 1 }];
      const sells: Tick[] = [{ symbol: 'T', price: 10, volume: 100, timestamp: 1 }];
      expect(calculateOrderImbalance(buys, sells)).toBeGreaterThan(0);
    });

    it('should return negative for sell heavy', () => {
      const buys: Tick[] = [{ symbol: 'T', price: 10, volume: 100, timestamp: 1 }];
      const sells: Tick[] = [{ symbol: 'T', price: 10, volume: 300, timestamp: 1 }];
      expect(calculateOrderImbalance(buys, sells)).toBeLessThan(0);
    });

    it('should return 0 for balanced', () => {
      const order: Tick[] = [{ symbol: 'T', price: 10, volume: 100, timestamp: 1 }];
      expect(calculateOrderImbalance(order, order)).toBe(0);
    });

    it('should return 0 for empty', () => {
      expect(calculateOrderImbalance([], [])).toBe(0);
    });

    it('should be between -1 and 1', () => {
      const buys = makeTicks(10);
      const sells = makeTicks(10);
      const imbalance = calculateOrderImbalance(buys, sells);
      expect(imbalance).toBeGreaterThanOrEqual(-1);
      expect(imbalance).toBeLessThanOrEqual(1);
    });
  });

  describe('OHLC Resampling', () => {
    it('should resample by factor', () => {
      const data: OHLC[] = [
        { open: 10, high: 12, low: 9, close: 11, volume: 100, timestamp: 1 },
        { open: 11, high: 13, low: 10, close: 12, volume: 200, timestamp: 2 },
        { open: 12, high: 14, low: 11, close: 13, volume: 150, timestamp: 3 },
        { open: 13, high: 15, low: 12, close: 14, volume: 250, timestamp: 4 },
      ];
      const result = resampleOHLC(data, 2);
      expect(result).toHaveLength(2);
      expect(result[0].open).toBe(10);
      expect(result[0].high).toBe(13);
      expect(result[0].low).toBe(9);
      expect(result[0].close).toBe(12);
      expect(result[0].volume).toBe(300);
    });

    it('should handle uneven chunks', () => {
      const data: OHLC[] = [
        { open: 10, high: 12, low: 9, close: 11, volume: 100, timestamp: 1 },
        { open: 11, high: 13, low: 10, close: 12, volume: 200, timestamp: 2 },
        { open: 12, high: 14, low: 11, close: 13, volume: 150, timestamp: 3 },
      ];
      const result = resampleOHLC(data, 2);
      expect(result).toHaveLength(2);
    });

    it('should handle factor = 1 (no resampling)', () => {
      const data: OHLC[] = [
        { open: 10, high: 12, low: 9, close: 11, volume: 100, timestamp: 1 },
      ];
      const result = resampleOHLC(data, 1);
      expect(result).toEqual(data);
    });

    it('should handle empty array', () => {
      expect(resampleOHLC([], 2)).toEqual([]);
    });
  });

  describe('Realized Volatility', () => {
    it('should calculate annualized volatility', () => {
      const prices = [100, 102, 99, 103, 101, 104, 100, 105, 103, 106,
        104, 107, 105, 108, 106, 109, 107, 110, 108, 111, 109];
      const vol = calculateRealizedVolatility(prices, 20);
      expect(vol[vol.length - 1]).toBeGreaterThan(0);
    });

    it('should return null for insufficient data', () => {
      const vol = calculateRealizedVolatility([100, 101], 5);
      expect(vol[0]).toBeNull();
      expect(vol[1]).toBeNull();
    });

    it('should handle flat prices (zero vol)', () => {
      const prices = Array(25).fill(100);
      const vol = calculateRealizedVolatility(prices, 20);
      expect(vol[vol.length - 1]).toBeCloseTo(0, 5);
    });

    it('should handle empty array', () => {
      expect(calculateRealizedVolatility([], 5)).toEqual([]);
    });
  });
});
