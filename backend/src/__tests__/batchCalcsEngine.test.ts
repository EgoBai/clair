import { describe, it, expect } from 'vitest';

// Batch calculation engine
describe('Batch Calculation Engine', () => {
  const calculateBatchMetrics = (stocks: Array<{
    price: number; prevClose: number; volume: number; turnover: number;
    high: number; low: number; marketCap: number;
  }>) => {
    return stocks.map((s, i) => {
      const change = s.price - s.prevClose;
      const changePercent = s.prevClose > 0 ? (change / s.prevClose) * 100 : 0;
      const amplitude = s.prevClose > 0 ? ((s.high - s.low) / s.prevClose) * 100 : 0;
      const turnoverRate = s.volume > 0 ? (s.turnover / (s.marketCap || 1)) * 100 : 0;
      const vwap = s.volume > 0 ? s.turnover / s.volume : s.price;
      return { index: i, change, changePercent, amplitude, turnoverRate, vwap };
    });
  };

  it('should calculate change for positive movement', () => {
    const result = calculateBatchMetrics([{ price: 110, prevClose: 100, volume: 10000, turnover: 1100000, high: 112, low: 108, marketCap: 1e9 }]);
    expect(result[0].change).toBe(10);
    expect(result[0].changePercent).toBe(10);
  });

  it('should calculate change for negative movement', () => {
    const result = calculateBatchMetrics([{ price: 90, prevClose: 100, volume: 5000, turnover: 450000, high: 95, low: 88, marketCap: 1e9 }]);
    expect(result[0].change).toBe(-10);
    expect(result[0].changePercent).toBe(-10);
  });

  it('should calculate amplitude correctly', () => {
    const result = calculateBatchMetrics([{ price: 100, prevClose: 100, volume: 1000, turnover: 100000, high: 110, low: 90, marketCap: 1e9 }]);
    expect(result[0].amplitude).toBeCloseTo(20, 1);
  });

  it('should calculate VWAP correctly', () => {
    const result = calculateBatchMetrics([{ price: 105, prevClose: 100, volume: 10000, turnover: 1050000, high: 108, low: 102, marketCap: 1e9 }]);
    expect(result[0].vwap).toBe(105);
  });

  it('should handle zero volume', () => {
    const result = calculateBatchMetrics([{ price: 100, prevClose: 100, volume: 0, turnover: 0, high: 100, low: 100, marketCap: 1e9 }]);
    expect(result[0].turnoverRate).toBe(0);
    expect(result[0].vwap).toBe(100);
  });

  it('should handle zero prevClose', () => {
    const result = calculateBatchMetrics([{ price: 100, prevClose: 0, volume: 1000, turnover: 100000, high: 100, low: 100, marketCap: 1e9 }]);
    expect(result[0].changePercent).toBe(0);
    expect(result[0].amplitude).toBe(0);
  });

  it('should process batch of stocks', () => {
    const stocks = Array.from({ length: 100 }, (_, i) => ({
      price: 10 + i, prevClose: 10 + i - 1, volume: 1000, turnover: 10000 * (10 + i),
      high: 10 + i + 2, low: 10 + i - 2, marketCap: 1e8
    }));
    const result = calculateBatchMetrics(stocks);
    expect(result).toHaveLength(100);
    expect(result[0].change).toBe(1);
    expect(result[99].change).toBe(1);
  });

  it('should calculate turnover rate with market cap', () => {
    const result = calculateBatchMetrics([{ price: 50, prevClose: 48, volume: 1000000, turnover: 50000000, high: 52, low: 47, marketCap: 10e8 }]);
    expect(result[0].turnoverRate).toBeCloseTo(5, 0);
  });

  it('should assign correct indices', () => {
    const result = calculateBatchMetrics([
      { price: 10, prevClose: 10, volume: 0, turnover: 0, high: 10, low: 10, marketCap: 1e8 },
      { price: 20, prevClose: 20, volume: 0, turnover: 0, high: 20, low: 20, marketCap: 1e8 },
    ]);
    expect(result[0].index).toBe(0);
    expect(result[1].index).toBe(1);
  });

  it('should handle negative prices gracefully', () => {
    const result = calculateBatchMetrics([{ price: -1, prevClose: 100, volume: 100, turnover: 100, high: 100, low: -1, marketCap: 1 }]);
    expect(Number.isFinite(result[0].changePercent)).toBe(true);
  });

  it('should calculate amplitude with equal high low', () => {
    const result = calculateBatchMetrics([{ price: 100, prevClose: 100, volume: 100, turnover: 10000, high: 100, low: 100, marketCap: 1e9 }]);
    expect(result[0].amplitude).toBe(0);
  });

  it('should handle very large turnover rate', () => {
    const result = calculateBatchMetrics([{ price: 10, prevClose: 10, volume: 1e9, turnover: 1e10, high: 11, low: 9, marketCap: 1 }]);
    expect(result[0].turnoverRate).toBeGreaterThan(100);
  });
});

// Market cap category classification
describe('Market Cap Classification', () => {
  const classifyMarketCap = (marketCap: number) => {
    if (marketCap >= 2000e8) return 'mega';   // >2000亿
    if (marketCap >= 500e8) return 'large';    // 500-2000亿
    if (marketCap >= 100e8) return 'mid';      // 100-500亿
    if (marketCap >= 20e8) return 'small';     // 20-100亿
    return 'micro';                            // <20亿
  };

  it('should classify mega cap', () => {
    expect(classifyMarketCap(3000e8)).toBe('mega');
  });

  it('should classify large cap', () => {
    expect(classifyMarketCap(1000e8)).toBe('large');
  });

  it('should classify mid cap', () => {
    expect(classifyMarketCap(200e8)).toBe('mid');
  });

  it('should classify small cap', () => {
    expect(classifyMarketCap(50e8)).toBe('small');
  });

  it('should classify micro cap', () => {
    expect(classifyMarketCap(5e8)).toBe('micro');
  });

  it('should classify boundary mega large', () => {
    expect(classifyMarketCap(2000e8)).toBe('mega');
    expect(classifyMarketCap(1999e8)).toBe('large');
  });

  it('should classify boundary large mid', () => {
    expect(classifyMarketCap(500e8)).toBe('large');
    expect(classifyMarketCap(499e8)).toBe('mid');
  });

  it('should classify boundary mid small', () => {
    expect(classifyMarketCap(100e8)).toBe('mid');
    expect(classifyMarketCap(99e8)).toBe('small');
  });

  it('should classify boundary small micro', () => {
    expect(classifyMarketCap(20e8)).toBe('small');
    expect(classifyMarketCap(19e8)).toBe('micro');
  });

  it('should handle zero', () => {
    expect(classifyMarketCap(0)).toBe('micro');
  });

  it('should handle negative', () => {
    expect(classifyMarketCap(-100)).toBe('micro');
  });
});

// Stock sector rotation scoring
describe('Sector Rotation Scoring', () => {
  const calculateSectorScore = (sector: {
    avgChangePercent: number; totalTurnover: number; advancers: number;
    decliners: number; limitUpCount: number; limitDownCount: number;
  }) => {
    const breadth = sector.advancers + sector.decliners > 0
      ? (sector.advancers / (sector.advancers + sector.decliners)) * 100 : 50;
    const momentum = sector.avgChangePercent * 10;
    const volume = Math.min(Math.log10(sector.totalTurnover + 1) * 10, 30);
    const limitFactor = (sector.limitUpCount - sector.limitDownCount) * 5;
    return Math.max(0, Math.min(100, breadth + momentum + volume + limitFactor));
  };

  it('should score strong sector high', () => {
    const score = calculateSectorScore({
      avgChangePercent: 3, totalTurnover: 1e10, advancers: 80, decliners: 20,
      limitUpCount: 10, limitDownCount: 0
    });
    expect(score).toBeGreaterThan(70);
  });

  it('should score weak sector low', () => {
    const score = calculateSectorScore({
      avgChangePercent: -3, totalTurnover: 1e8, advancers: 20, decliners: 80,
      limitUpCount: 0, limitDownCount: 10
    });
    expect(score).toBeLessThan(30);
  });

  it('should score neutral sector mid range', () => {
    const score = calculateSectorScore({
      avgChangePercent: 0, totalTurnover: 1e9, advancers: 50, decliners: 50,
      limitUpCount: 0, limitDownCount: 0
    });
    expect(score).toBeGreaterThan(15);
    expect(score).toBeLessThan(85);
  });

  it('should clamp score to 0-100', () => {
    const extreme = calculateSectorScore({
      avgChangePercent: -10, totalTurnover: 0, advancers: 0, decliners: 100,
      limitUpCount: 0, limitDownCount: 50
    });
    expect(extreme).toBe(0);
    const extremeHigh = calculateSectorScore({
      avgChangePercent: 10, totalTurnover: 1e15, advancers: 100, decliners: 0,
      limitUpCount: 50, limitDownCount: 0
    });
    expect(extremeHigh).toBe(100);
  });

  it('should handle zero advancers decliners', () => {
    const score = calculateSectorScore({
      avgChangePercent: 1, totalTurnover: 1e9, advancers: 0, decliners: 0,
      limitUpCount: 0, limitDownCount: 0
    });
    expect(score).toBeGreaterThan(0);
  });

  it('should weigh limit up positively', () => {
    const withLimitUp = calculateSectorScore({
      avgChangePercent: 0, totalTurnover: 1e9, advancers: 50, decliners: 50,
      limitUpCount: 5, limitDownCount: 0
    });
    const withoutLimit = calculateSectorScore({
      avgChangePercent: 0, totalTurnover: 1e9, advancers: 50, decliners: 50,
      limitUpCount: 0, limitDownCount: 0
    });
    expect(withLimitUp).toBeGreaterThan(withoutLimit);
  });

  it('should weigh limit down negatively', () => {
    const withLimitDown = calculateSectorScore({
      avgChangePercent: 0, totalTurnover: 1e9, advancers: 50, decliners: 50,
      limitUpCount: 0, limitDownCount: 5
    });
    const withoutLimit = calculateSectorScore({
      avgChangePercent: 0, totalTurnover: 1e9, advancers: 50, decliners: 50,
      limitUpCount: 0, limitDownCount: 0
    });
    expect(withLimitDown).toBeLessThan(withoutLimit);
  });

  it('should handle equal limit up and down', () => {
    const score = calculateSectorScore({
      avgChangePercent: 0, totalTurnover: 1e9, advancers: 50, decliners: 50,
      limitUpCount: 3, limitDownCount: 3
    });
    expect(score).toBeGreaterThan(0);
  });

  it('should handle high turnover boost', () => {
    const highTurnover = calculateSectorScore({
      avgChangePercent: 0, totalTurnover: 1e12, advancers: 50, decliners: 50,
      limitUpCount: 0, limitDownCount: 0
    });
    const lowTurnover = calculateSectorScore({
      avgChangePercent: 0, totalTurnover: 1e6, advancers: 50, decliners: 50,
      limitUpCount: 0, limitDownCount: 0
    });
    expect(highTurnover).toBeGreaterThanOrEqual(lowTurnover);
  });

  it('should handle all decliners', () => {
    const score = calculateSectorScore({
      avgChangePercent: -1, totalTurnover: 1e9, advancers: 0, decliners: 100,
      limitUpCount: 0, limitDownCount: 1
    });
    expect(score).toBeLessThan(40);
  });
});

// Price volume divergence detection
describe('Price Volume Divergence', () => {
  const detectDivergence = (prices: number[], volumes: number[]) => {
    if (prices.length < 2 || volumes.length < 2) return 'insufficient_data';
    const priceTrend = prices[prices.length - 1] - prices[0];
    const volumeTrend = volumes[volumes.length - 1] - volumes[0];
    if (priceTrend > 0 && volumeTrend < 0) return 'bearish_divergence';
    if (priceTrend < 0 && volumeTrend > 0) return 'bullish_divergence';
    if (priceTrend > 0 && volumeTrend > 0) return 'confirming';
    if (priceTrend < 0 && volumeTrend < 0) return 'weakening';
    return 'neutral';
  };

  it('should detect bearish divergence', () => {
    expect(detectDivergence([10, 12, 15], [1000, 800, 500])).toBe('bearish_divergence');
  });

  it('should detect bullish divergence', () => {
    expect(detectDivergence([15, 13, 10], [500, 800, 1000])).toBe('bullish_divergence');
  });

  it('should detect confirming trend', () => {
    expect(detectDivergence([10, 12, 15], [500, 800, 1000])).toBe('confirming');
  });

  it('should detect weakening trend', () => {
    expect(detectDivergence([15, 13, 10], [1000, 800, 500])).toBe('weakening');
  });

  it('should handle insufficient data', () => {
    expect(detectDivergence([10], [1000])).toBe('insufficient_data');
    expect(detectDivergence([], [])).toBe('insufficient_data');
  });

  it('should handle flat price', () => {
    // Price trend = 0, volume trend > 0 → priceTrend <= 0 && volumeTrend > 0 is false (priceTrend is 0, not < 0)
    // Actually priceTrend(0) > 0 is false, priceTrend(0) < 0 is false → falls through to neutral
    expect(detectDivergence([10, 10, 10], [500, 800, 1000])).toBe('neutral');
  });

  it('should handle flat volume', () => {
    // priceTrend > 0 && volumeTrend === 0 → falls to neutral (volumeTrend not > 0, not < 0)
    expect(detectDivergence([10, 12, 15], [500, 500, 500])).toBe('neutral');
  });

  it('should handle both flat', () => {
    expect(detectDivergence([10, 10], [500, 500])).toBe('neutral');
  });

  it('should handle long arrays', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 10 + i * 0.5);
    const volumes = Array.from({ length: 30 }, (_, i) => 1000 - i * 20);
    expect(detectDivergence(prices, volumes)).toBe('bearish_divergence');
  });

  it('should handle equal length mismatch gracefully', () => {
    expect(detectDivergence([10, 15], [1000, 500])).toBe('bearish_divergence');
  });
});

// KDJ calculation independent test
describe('KDJ Indicator Calculation', () => {
  const calculateKDJ = (highs: number[], lows: number[], closes: number[], period = 9) => {
    const result: Array<{ K: number; D: number; J: number }> = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1) {
        result.push({ K: 50, D: 50, J: 50 });
        continue;
      }
      const sliceH = highs.slice(i - period + 1, i + 1);
      const sliceL = lows.slice(i - period + 1, i + 1);
      const hn = Math.max(...sliceH);
      const ln = Math.min(...sliceL);
      const rsv = hn === ln ? 50 : ((closes[i] - ln) / (hn - ln)) * 100;
      const prevK = result.length > 0 ? result[result.length - 1].K : 50;
      const prevD = result.length > 0 ? result[result.length - 1].D : 50;
      const K = (2 / 3) * prevK + (1 / 3) * rsv;
      const D = (2 / 3) * prevD + (1 / 3) * K;
      const J = 3 * K - 2 * D;
      result.push({ K, D, J });
    }
    return result;
  };

  it('should calculate KDJ for uptrend', () => {
    const highs = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const lows = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const closes = [9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5];
    const kdj = calculateKDJ(highs, lows, closes);
    expect(kdj).toHaveLength(10);
    const last = kdj[kdj.length - 1];
    expect(last.K).toBeGreaterThan(50);
  });

  it('should calculate KDJ for downtrend', () => {
    const highs = [19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    const lows = [18, 17, 16, 15, 14, 13, 12, 11, 10, 9];
    const closes = [18.5, 17.5, 16.5, 15.5, 14.5, 13.5, 12.5, 11.5, 10.5, 9.5];
    const kdj = calculateKDJ(highs, lows, closes);
    const last = kdj[kdj.length - 1];
    expect(last.K).toBeLessThan(50);
  });

  it('should have initial values at 50', () => {
    const kdj = calculateKDJ([1, 1, 1], [0, 0, 0], [0.5, 0.5, 0.5], 3);
    expect(kdj[0].K).toBe(50);
    expect(kdj[0].D).toBe(50);
    expect(kdj[0].J).toBe(50);
  });

  it('should satisfy J = 3K - 2D', () => {
    const highs = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const lows = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const closes = [9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5];
    const kdj = calculateKDJ(highs, lows, closes);
    for (const { K, D, J } of kdj) {
      expect(J).toBeCloseTo(3 * K - 2 * D, 10);
    }
  });

  it('should handle flat prices', () => {
    const highs = Array(10).fill(10);
    const lows = Array(10).fill(10);
    const closes = Array(10).fill(10);
    const kdj = calculateKDJ(highs, lows, closes);
    expect(kdj[9].K).toBeCloseTo(50, 0);
  });

  it('should handle empty data', () => {
    const kdj = calculateKDJ([], [], []);
    expect(kdj).toHaveLength(0);
  });

  it('should handle period larger than data', () => {
    const kdj = calculateKDJ([1, 2], [0, 1], [0.5, 1.5], 5);
    expect(kdj).toHaveLength(2);
    expect(kdj[0].K).toBe(50);
  });

  it('should handle period=1', () => {
    const kdj = calculateKDJ([10, 12], [8, 10], [9, 11], 1);
    expect(kdj[1].K).toBeGreaterThan(0);
  });

  it('should produce values in reasonable range for volatile data', () => {
    const highs = [100, 105, 98, 110, 95, 108, 102, 115, 97, 112];
    const lows = [95, 100, 93, 105, 90, 103, 97, 110, 92, 107];
    const closes = [97, 103, 95, 108, 92, 106, 99, 113, 94, 110];
    const kdj = calculateKDJ(highs, lows, closes);
    for (const { K, D, J } of kdj) {
      expect(Number.isFinite(K)).toBe(true);
      expect(Number.isFinite(D)).toBe(true);
      expect(Number.isFinite(J)).toBe(true);
    }
  });

  it('should increase K in continuous uptrend', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 10 + i);
    const lows = Array.from({ length: n }, (_, i) => 9 + i);
    const closes = Array.from({ length: n }, (_, i) => 9.8 + i);
    const kdj = calculateKDJ(highs, lows, closes);
    const last = kdj[kdj.length - 1];
    expect(last.K).toBeGreaterThan(70);
  });
});

// Moving average convergence analysis
describe('MA Convergence Analysis', () => {
  const findMACrosses = (shortMA: number[], longMA: number[]) => {
    const crosses: Array<{ index: number; type: 'golden' | 'death' }> = [];
    for (let i = 1; i < shortMA.length && i < longMA.length; i++) {
      const prevDiff = shortMA[i - 1] - longMA[i - 1];
      const currDiff = shortMA[i] - longMA[i];
      if (prevDiff <= 0 && currDiff > 0) crosses.push({ index: i, type: 'golden' });
      if (prevDiff >= 0 && currDiff < 0) crosses.push({ index: i, type: 'death' });
    }
    return crosses;
  };

  it('should detect golden cross', () => {
    // [1,2,3,4] vs [3,3,3,3]: i=1: prevDiff=-2, currDiff=-1 (no); i=2: prevDiff=-1, currDiff=0 (no, not > 0); i=3: prevDiff=0, currDiff=1 (golden!)
    const crosses = findMACrosses([1, 2, 3, 4], [3, 3, 3, 3]);
    expect(crosses).toHaveLength(1);
    expect(crosses[0].type).toBe('golden');
    expect(crosses[0].index).toBe(3);
  });

  it('should detect death cross', () => {
    // [4,3,2,1] vs [3,3,3,3]: i=1: prevDiff=1, currDiff=0 (no, not < 0); i=2: prevDiff=0, currDiff=-1 (death!); i=3: prevDiff=-1, currDiff=-2 (no)
    const crosses = findMACrosses([4, 3, 2, 1], [3, 3, 3, 3]);
    expect(crosses).toHaveLength(1);
    expect(crosses[0].type).toBe('death');
    expect(crosses[0].index).toBe(2);
  });

  it('should detect multiple crosses', () => {
    const crosses = findMACrosses([1, 4, 1, 4], [3, 3, 3, 3]);
    expect(crosses).toHaveLength(3);
  });

  it('should return empty when no crosses', () => {
    const crosses = findMACrosses([5, 6, 7], [3, 3, 3]);
    expect(crosses).toHaveLength(0);
  });

  it('should handle equal MA values', () => {
    const crosses = findMACrosses([3, 3, 3], [3, 3, 3]);
    expect(crosses).toHaveLength(0);
  });

  it('should handle empty arrays', () => {
    expect(findMACrosses([], [])).toHaveLength(0);
  });

  it('should handle single element', () => {
    expect(findMACrosses([5], [3])).toHaveLength(0);
  });

  it('should handle tangent crossing', () => {
    const crosses = findMACrosses([3, 3, 4], [3, 3, 3]);
    expect(crosses.some(c => c.type === 'golden')).toBe(true);
  });

  it('should handle crossing at first element', () => {
    const crosses = findMACrosses([2, 4], [3, 3]);
    expect(crosses[0].index).toBe(1);
    expect(crosses[0].type).toBe('golden');
  });

  it('should handle long arrays', () => {
    const n = 100;
    const short = Array.from({ length: n }, (_, i) => 50 + 30 * Math.sin(i * 0.2));
    const long = Array.from({ length: n }, () => 50);
    const crosses = findMACrosses(short, long);
    expect(crosses.length).toBeGreaterThan(0);
    for (const c of crosses) {
      expect(['golden', 'death']).toContain(c.type);
      expect(c.index).toBeGreaterThanOrEqual(1);
      expect(c.index).toBeLessThan(n);
    }
  });

  it('should have crossing types alternate', () => {
    const crosses = findMACrosses([1, 5, 1, 5, 1], [3, 3, 3, 3, 3]);
    for (let i = 1; i < crosses.length; i++) {
      expect(crosses[i].type).not.toBe(crosses[i - 1].type);
    }
  });
});

// Weighted average calculation
describe('Weighted Average Calculation', () => {
  const weightedAvg = (values: number[], weights: number[]) => {
    if (values.length === 0 || weights.length === 0) return 0;
    if (values.length !== weights.length) throw new Error('Length mismatch');
    let totalWeight = 0;
    let weightedSum = 0;
    for (let i = 0; i < values.length; i++) {
      weightedSum += values[i] * weights[i];
      totalWeight += weights[i];
    }
    return totalWeight === 0 ? 0 : weightedSum / totalWeight;
  };

  it('should calculate correct weighted average', () => {
    expect(weightedAvg([10, 20], [1, 1])).toBe(15);
  });

  it('should weight higher weight more', () => {
    expect(weightedAvg([10, 20], [3, 1])).toBe(12.5);
  });

  it('should handle single element', () => {
    expect(weightedAvg([42], [1])).toBe(42);
  });

  it('should handle empty arrays', () => {
    expect(weightedAvg([], [])).toBe(0);
  });

  it('should handle zero weights', () => {
    expect(weightedAvg([10, 20], [0, 0])).toBe(0);
  });

  it('should throw on length mismatch', () => {
    expect(() => weightedAvg([1, 2], [1])).toThrow('Length mismatch');
  });

  it('should handle decimal values', () => {
    expect(weightedAvg([10.5, 20.5], [1, 1])).toBeCloseTo(15.5);
  });

  it('should handle negative values', () => {
    expect(weightedAvg([-10, 10], [1, 1])).toBe(0);
  });

  it('should handle large arrays', () => {
    const values = Array.from({ length: 1000 }, (_, i) => i);
    const weights = Array(1000).fill(1);
    const avg = weightedAvg(values, weights);
    expect(avg).toBeCloseTo(499.5, 0);
  });

  it('should be consistent with simple average for equal weights', () => {
    const values = [3, 7, 11, 2];
    const weights = [1, 1, 1, 1];
    expect(weightedAvg(values, weights)).toBeCloseTo(5.75);
  });
});
