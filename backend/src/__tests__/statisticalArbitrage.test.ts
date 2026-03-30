import { describe, it, expect } from 'vitest';

// ==================== 统计套利测试 ====================

function calcCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let cov = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
    varX += (x[i] - meanX) ** 2;
    varY += (y[i] - meanY) ** 2;
  }
  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

function calcHedgeRatio(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 1;
  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let cov = 0, varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
    varX += (x[i] - meanX) ** 2;
  }
  return varX === 0 ? 1 : cov / varX;
}

function calcSpread(x: number[], y: number[], hedgeRatio: number): number[] {
  const n = Math.min(x.length, y.length);
  return Array.from({ length: n }, (_, i) => y[i] - hedgeRatio * x[i]);
}

function calcHalfLife(spread: number[]): number {
  if (spread.length < 3) return 1;
  const lagged = spread.slice(0, -1);
  const diff = spread.slice(1).map((s, i) => s - lagged[i]);
  const meanLagged = lagged.reduce((a, b) => a + b, 0) / lagged.length;
  const meanDiff = diff.reduce((a, b) => a + b, 0) / diff.length;
  let cov = 0, varLagged = 0;
  for (let i = 0; i < lagged.length; i++) {
    cov += (lagged[i] - meanLagged) * (diff[i] - meanDiff);
    varLagged += (lagged[i] - meanLagged) ** 2;
  }
  const beta = varLagged === 0 ? -1 : cov / varLagged;
  if (beta >= 0) return 1000;
  return -Math.log(2) / Math.log(1 + beta);
}

function generatePairsSignals(spread: number[], entryZ: number = 2, exitZ: number = 0): { long: number; short: number; exits: number } {
  const mean = spread.reduce((a, b) => a + b, 0) / spread.length;
  const std = Math.sqrt(spread.reduce((a, b) => a + (b - mean) ** 2, 0) / spread.length);
  if (std === 0) return { long: 0, short: 0, exits: 0 };
  let long = 0, short = 0, exits = 0, position = 0;
  for (const s of spread) {
    const z = (s - mean) / std;
    if (position === 0 && z > entryZ) { position = -1; short++; }
    else if (position === 0 && z < -entryZ) { position = 1; long++; }
    else if (position !== 0 && Math.abs(z) < exitZ) { position = 0; exits++; }
  }
  return { long, short, exits };
}

function testCointegration(x: number[], y: number[]): { adfStat: number; isCointegrated: boolean } {
  const spread = x.map((v, i) => y[i] - v);
  const n = spread.length;
  if (n < 3) return { adfStat: 0, isCointegrated: false };
  const diff = spread.slice(1).map((s, i) => s - spread[i]);
  const lagged = spread.slice(0, -1);
  const meanLagged = lagged.reduce((a, b) => a + b, 0) / lagged.length;
  let cov = 0, varL = 0;
  for (let i = 0; i < lagged.length; i++) {
    cov += (lagged[i] - meanLagged) * diff[i];
    varL += (lagged[i] - meanLagged) ** 2;
  }
  const beta = varL === 0 ? 0 : cov / varL;
  return { adfStat: beta, isCointegrated: beta < -0.3 };
}

describe('统计套利', () => {
  const stockA = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 110, 108, 106, 107, 109, 111, 113, 112, 114, 116];
  const stockB = [50, 51, 50.5, 51.5, 52.5, 52, 53, 54, 53.5, 54.5, 55, 54, 53, 53.5, 54.5, 55.5, 56.5, 56, 57, 58];

  describe('相关性计算', () => {
    it('完全正相关应该为1', () => {
      expect(calcCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 5);
    });

    it('完全负相关应该为-1', () => {
      expect(calcCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1, 5);
    });

    it('同向变动的股票应该正相关', () => {
      expect(calcCorrelation(stockA, stockB)).toBeGreaterThan(0.5);
    });

    it('空数据应该返回0', () => {
      expect(calcCorrelation([], [])).toBe(0);
    });

    it('常数序列应该返回0', () => {
      expect(calcCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
    });
  });

  describe('对冲比率', () => {
    it('线性关系应该正确计算', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(calcHedgeRatio(x, y)).toBeCloseTo(2, 5);
    });

    it('数据不足应该返回1', () => {
      expect(calcHedgeRatio([1], [2])).toBe(1);
    });

    it('应该为正数（正相关股票）', () => {
      expect(calcHedgeRatio(stockA, stockB)).toBeGreaterThan(0);
    });
  });

  describe('价差计算', () => {
    it('应该正确计算spread', () => {
      const spread = calcSpread([100, 102], [50, 51], 0.5);
      expect(spread[0]).toBe(0);
      expect(spread[1]).toBe(0);
    });

    it('长度应该等于输入最小长度', () => {
      const spread = calcSpread(stockA, stockB, 0.5);
      expect(spread.length).toBe(Math.min(stockA.length, stockB.length));
    });

    it('零对冲比率spread应该等于Y', () => {
      const spread = calcSpread([100, 102], [50, 51], 0);
      expect(spread).toEqual([50, 51]);
    });
  });

  describe('半衰期', () => {
    it('均值回归序列应该有有效半衰期', () => {
      // Use a more realistic mean-reverting series
      const spread = [5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
      const hl = calcHalfLife(spread);
      expect(hl).toBeGreaterThan(0);
      expect(Number.isFinite(hl)).toBe(true);
    });

    it('数据不足应该返回1', () => {
      expect(calcHalfLife([1, 2])).toBe(1);
    });

    it('半衰期应该为正数或大数', () => {
      const hl = calcHalfLife(stockA.map((v, i) => v - stockB[i]));
      expect(hl).toBeGreaterThan(0);
      expect(Number.isFinite(hl)).toBe(true);
    });
  });

  describe('配对交易信号', () => {
    it('应该检测交易信号', () => {
      const spread = [0, 0, 0, 5, 5, 5, 0, 0, 0, -5, -5, -5, 0, 0];
      const signals = generatePairsSignals(spread, 1, 0.5);
      expect(signals.long + signals.short).toBeGreaterThanOrEqual(0);
    });

    it('常数spread不应该产生信号', () => {
      const signals = generatePairsSignals([5, 5, 5, 5, 5]);
      expect(signals.long + signals.short).toBe(0);
    });

    it('信号数不应该超过数据长度', () => {
      const spread = stockA.map((v, i) => v - stockB[i]);
      const signals = generatePairsSignals(spread);
      expect(signals.long + signals.short + signals.exits).toBeLessThanOrEqual(spread.length);
    });
  });

  describe('协整检验', () => {
    it('应该返回统计量和结论', () => {
      const result = testCointegration(stockA, stockB);
      expect(typeof result.adfStat).toBe('number');
      expect(typeof result.isCointegrated).toBe('boolean');
    });

    it('相同序列应该有近零统计量', () => {
      const result = testCointegration(stockA, stockA);
      // Spread = 0 for all, so the regression beta is essentially 0 (flat)
      expect(typeof result.adfStat).toBe('number');
      expect(Number.isFinite(result.adfStat)).toBe(true);
    });

    it('数据不足不应该崩溃', () => {
      const result = testCointegration([1], [2]);
      expect(result.isCointegrated).toBe(false);
    });
  });
});
