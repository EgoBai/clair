import { describe, it, expect } from 'vitest';

// Data aggregation and transformation utilities
interface TickData {
  timestamp: number;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
}

interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

function aggregateTicksToKline(ticks: TickData[]): OHLCV {
  if (ticks.length === 0) return { open: 0, high: 0, low: 0, close: 0, volume: 0, turnover: 0 };
  const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
  return {
    open: sorted[0].price,
    high: Math.max(...ticks.map(t => t.price)),
    low: Math.min(...ticks.map(t => t.price)),
    close: sorted[sorted.length - 1].price,
    volume: ticks.reduce((s, t) => s + t.volume, 0),
    turnover: ticks.reduce((s, t) => s + t.price * t.volume, 0),
  };
}

function resampleKlines(klines: OHLCV[], factor: number): OHLCV[] {
  const result: OHLCV[] = [];
  for (let i = 0; i < klines.length; i += factor) {
    const chunk = klines.slice(i, i + factor);
    if (chunk.length > 0) {
      result.push({
        open: chunk[0].open,
        high: Math.max(...chunk.map(k => k.high)),
        low: Math.min(...chunk.map(k => k.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, k) => s + k.volume, 0),
        turnover: chunk.reduce((s, k) => s + k.turnover, 0),
      });
    }
  }
  return result;
}

function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [0];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

function calculateLogReturns(prices: number[]): number[] {
  const returns: number[] = [0];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  return returns;
}

function normalizeData(data: number[]): number[] {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  if (range === 0) return data.map(() => 0);
  return data.map(d => (d - min) / range);
}

function zScoreNormalize(data: number[]): number[] {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const std = Math.sqrt(data.reduce((s, d) => s + (d - mean) ** 2, 0) / data.length);
  if (std === 0) return data.map(() => 0);
  return data.map(d => (d - mean) / std);
}

function calculateRollingAverage(data: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / window);
    }
  }
  return result;
}

function calculateRollingStdDev(data: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(NaN);
    } else {
      const slice = data.slice(i - window + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / window;
      const variance = slice.reduce((s, d) => s + (d - mean) ** 2, 0) / window;
      result.push(Math.sqrt(variance));
    }
  }
  return result;
}

function detectOutliers(data: number[], threshold: number = 2): number[] {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const std = Math.sqrt(data.reduce((s, d) => s + (d - mean) ** 2, 0) / data.length);
  if (std === 0) return [];
  return data.map((d, i) => Math.abs(d - mean) / std > threshold ? i : -1).filter(i => i >= 0);
}

function interpolateMissing(data: (number | null)[]): number[] {
  const result = [...data] as (number | null)[];
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) {
      let prevIdx = i - 1;
      let nextIdx = i + 1;
      while (prevIdx >= 0 && result[prevIdx] === null) prevIdx--;
      while (nextIdx < result.length && result[nextIdx] === null) nextIdx++;
      if (prevIdx >= 0 && nextIdx < result.length) {
        result[i] = (result[prevIdx]! + result[nextIdx]!) / 2;
      } else if (prevIdx >= 0) {
        result[i] = result[prevIdx];
      } else if (nextIdx < result.length) {
        result[i] = result[nextIdx];
      } else {
        result[i] = 0;
      }
    }
  }
  return result as number[];
}

function calculateCorrelationMatrix(returnsMatrix: number[][]): number[][] {
  const n = returnsMatrix.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (j > i) {
        const r = calculateCorrelation(returnsMatrix[i], returnsMatrix[j]);
        matrix[i][j] = r;
        matrix[j][i] = r;
      }
    }
  }
  return matrix;
}

function calculateCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - meanA) * (b[i] - meanB);
    varA += (a[i] - meanA) ** 2;
    varB += (b[i] - meanB) ** 2;
  }
  if (varA === 0 || varB === 0) return 0;
  return cov / Math.sqrt(varA * varB);
}

describe('数据聚合与转换', () => {
  const ticks: TickData[] = [
    { timestamp: 1, price: 100, volume: 100, side: 'buy' },
    { timestamp: 2, price: 102, volume: 200, side: 'buy' },
    { timestamp: 3, price: 99, volume: 150, side: 'sell' },
    { timestamp: 4, price: 101, volume: 300, side: 'buy' },
  ];

  describe('Tick聚合为K线', () => {
    it('应该正确聚合OHLCV', () => {
      const kline = aggregateTicksToKline(ticks);
      expect(kline.open).toBe(100);
      expect(kline.high).toBe(102);
      expect(kline.low).toBe(99);
      expect(kline.close).toBe(101);
      expect(kline.volume).toBe(750);
    });

    it('空数据应该返回全0', () => {
      const kline = aggregateTicksToKline([]);
      expect(kline.open).toBe(0);
      expect(kline.volume).toBe(0);
    });

    it('单条Tick OHLC应该都等于该价格', () => {
      const kline = aggregateTicksToKline([ticks[0]]);
      expect(kline.open).toBe(kline.close);
      expect(kline.high).toBe(kline.low);
    });
  });

  describe('K线重采样', () => {
    it('应该正确合并', () => {
      const klines: OHLCV[] = [
        { open: 100, high: 105, low: 98, close: 103, volume: 1000, turnover: 102000 },
        { open: 103, high: 108, low: 101, close: 106, volume: 1500, turnover: 160000 },
        { open: 106, high: 110, low: 104, close: 108, volume: 1200, turnover: 130000 },
      ];
      const resampled = resampleKlines(klines, 2);
      expect(resampled.length).toBe(2);
      expect(resampled[0].open).toBe(100);
      expect(resampled[0].high).toBe(108);
      expect(resampled[0].low).toBe(98);
      expect(resampled[0].close).toBe(106);
    });

    it('空数据应该返回空', () => {
      expect(resampleKlines([], 2)).toEqual([]);
    });
  });

  describe('收益率计算', () => {
    it('应该正确计算简单收益率', () => {
      const returns = calculateReturns([100, 110, 105]);
      expect(returns[0]).toBe(0);
      expect(returns[1]).toBeCloseTo(0.1);
      expect(returns[2]).toBeCloseTo(-0.0455, 3);
    });

    it('应该正确计算对数收益率', () => {
      const returns = calculateLogReturns([100, 110]);
      expect(returns[0]).toBe(0);
      expect(returns[1]).toBeCloseTo(Math.log(1.1));
    });

    it('单一价格应该返回[0]', () => {
      expect(calculateReturns([100])).toEqual([0]);
    });
  });

  describe('数据归一化', () => {
    it('应该归一化到0-1', () => {
      const normalized = normalizeData([10, 20, 30, 40, 50]);
      expect(normalized[0]).toBe(0);
      expect(normalized[4]).toBe(1);
      expect(normalized[2]).toBe(0.5);
    });

    it('相同值应该都为0', () => {
      const normalized = normalizeData([5, 5, 5]);
      expect(normalized.every(v => v === 0)).toBe(true);
    });
  });

  describe('Z-Score归一化', () => {
    it('应该有均值0', () => {
      const normalized = zScoreNormalize([1, 2, 3, 4, 5]);
      const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length;
      expect(mean).toBeCloseTo(0);
    });

    it('相同值应该都为0', () => {
      expect(zScoreNormalize([5, 5, 5]).every(v => v === 0)).toBe(true);
    });
  });

  describe('滚动计算', () => {
    it('应该正确计算滚动均值', () => {
      const avg = calculateRollingAverage([1, 2, 3, 4, 5], 3);
      expect(isNaN(avg[0])).toBe(true);
      expect(avg[2]).toBe(2);
      expect(avg[4]).toBe(4);
    });

    it('应该正确计算滚动标准差', () => {
      const std = calculateRollingStdDev([1, 1, 1, 1, 1], 3);
      expect(std[2]).toBe(0);
    });

    it('滚动窗口为1应该等于原值', () => {
      const avg = calculateRollingAverage([1, 2, 3], 1);
      expect(avg).toEqual([1, 2, 3]);
    });
  });

  describe('异常值检测', () => {
    it('应该检测异常值', () => {
      const outliers = detectOutliers([1, 2, 3, 100, 2, 3, 1]);
      expect(outliers).toContain(3);
    });

    it('无异常值应该返回空', () => {
      const outliers = detectOutliers([1, 2, 3, 4, 5]);
      expect(outliers.length).toBe(0);
    });

    it('相同值应该返回空', () => {
      expect(detectOutliers([5, 5, 5]).length).toBe(0);
    });
  });

  describe('缺失值插值', () => {
    it('应该线性插值', () => {
      const result = interpolateMissing([1, null, 3, null, 5]);
      expect(result[1]).toBe(2);
      expect(result[3]).toBe(4);
    });

    it('开头缺失应该用下一个值', () => {
      const result = interpolateMissing([null, null, 3]);
      expect(result[0]).toBe(3);
    });

    it('结尾缺失应该用上一个值', () => {
      const result = interpolateMissing([1, null, null]);
      expect(result[2]).toBe(1);
    });

    it('全部缺失应该返回全0', () => {
      const result = interpolateMissing([null, null, null]);
      expect(result.every(v => v === 0)).toBe(true);
    });
  });

  describe('相关性矩阵', () => {
    it('应该计算对称矩阵', () => {
      const matrix = calculateCorrelationMatrix([[1, 2, 3], [2, 4, 6]]);
      expect(matrix[0][0]).toBe(1);
      expect(matrix[1][1]).toBe(1);
      expect(matrix[0][1]).toBeCloseTo(matrix[1][0]);
    });

    it('完全正相关的矩阵', () => {
      const matrix = calculateCorrelationMatrix([[1, 2, 3], [1, 2, 3]]);
      expect(matrix[0][1]).toBeCloseTo(1);
    });

    it('对角线应该为1', () => {
      const matrix = calculateCorrelationMatrix([[1, 2], [3, 4], [5, 6]]);
      for (let i = 0; i < 3; i++) {
        expect(matrix[i][i]).toBe(1);
      }
    });
  });
});
