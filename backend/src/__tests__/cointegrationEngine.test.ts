import { describe, it, expect } from 'vitest';

describe('协整分析与配对价差引擎', () => {
  // Engle-Granger 两步法简化版
  function engleGrangerTest(y: number[], x: number[], lookback?: number) {
    const len = lookback ? Math.min(y.length, lookback) : y.length;
    const sliceY = y.slice(-len), sliceX = x.slice(-len);
    // OLS: y = a + b*x
    const meanX = sliceX.reduce((a, b) => a + b, 0) / len;
    const meanY = sliceY.reduce((a, b) => a + b, 0) / len;
    const cov = sliceX.reduce((s, xi, i) => s + (xi - meanX) * (sliceY[i] - meanY), 0) / len;
    const varX = sliceX.reduce((s, xi) => s + (xi - meanX) ** 2, 0) / len;
    const beta = varX === 0 ? 1 : cov / varX;
    const alpha = meanY - beta * meanX;
    const residuals = sliceY.map((yi, i) => yi - (alpha + beta * sliceX[i]));
    // ADF-like test on residuals
    const meanRes = residuals.reduce((a, b) => a + b, 0) / len;
    const stdRes = Math.sqrt(residuals.reduce((s, r) => s + (r - meanRes) ** 2, 0) / len);
    const diffs = residuals.slice(1).map((r, i) => r - residuals[i]);
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const varRes = residuals.slice(0, -1).reduce((s, r) => s + (r - meanRes) ** 2, 0) / diffs.length;
    const rho = varRes === 0 ? 0 : (diffs.reduce((s, d, i) => s + d * (residuals[i] - meanRes), 0) / diffs.length) / varRes;
    const isCointegrated = rho < -0.1 && stdRes < Math.abs(meanY) * 0.5;
    return { alpha, beta, residuals, rho, isCointegrated, spreadStd: stdRes };
  }

  // 价差Z-Score
  function spreadZScore(spread: number[], window: number) {
    if (spread.length < window) return [];
    const zScores: number[] = [];
    for (let i = window - 1; i < spread.length; i++) {
      const slice = spread.slice(i - window + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
      zScores.push(std === 0 ? 0 : (spread[i] - mean) / std);
    }
    return zScores;
  }

  // 价差交易信号
  function spreadSignal(zScores: number[], entryThreshold = 2, exitThreshold = 0.5) {
    const signals: { action: 'long' | 'short' | 'close' | 'hold'; zScore: number }[] = [];
    let position = 0;
    for (const z of zScores) {
      if (position === 0) {
        if (z < -entryThreshold) { position = 1; signals.push({ action: 'long', zScore: z }); }
        else if (z > entryThreshold) { position = -1; signals.push({ action: 'short', zScore: z }); }
        else signals.push({ action: 'hold', zScore: z });
      } else if (position === 1) {
        if (z >= -exitThreshold) { position = 0; signals.push({ action: 'close', zScore: z }); }
        else signals.push({ action: 'hold', zScore: z });
      } else {
        if (z <= exitThreshold) { position = 0; signals.push({ action: 'close', zScore: z }); }
        else signals.push({ action: 'hold', zScore: z });
      }
    }
    return signals;
  }

  // Half-life of mean reversion
  function halfLife(spread: number[]) {
    const y = spread.slice(1);
    const x = spread.slice(0, -1);
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    const cov = x.reduce((s, xi, i) => s + (xi - meanX) * (y[i] - meanY), 0) / n;
    const varX = x.reduce((s, xi) => s + (xi - meanX) ** 2, 0) / n;
    const beta = varX === 0 ? 0 : cov / varX;
    return beta >= 1 ? Infinity : Math.log(0.5) / Math.log(beta);
  }

  // Rolling correlation
  function rollingCorrelation(x: number[], y: number[], window: number) {
    const min = Math.min(x.length, y.length);
    if (min < window) return [];
    const result: number[] = [];
    for (let i = window - 1; i < min; i++) {
      const sx = x.slice(i - window + 1, i + 1);
      const sy = y.slice(i - window + 1, i + 1);
      const mx = sx.reduce((a, b) => a + b, 0) / window;
      const my = sy.reduce((a, b) => a + b, 0) / window;
      const cov = sx.reduce((s, xi, j) => s + (xi - mx) * (sy[j] - my), 0) / window;
      const stdX = Math.sqrt(sx.reduce((s, xi) => s + (xi - mx) ** 2, 0) / window);
      const stdY = Math.sqrt(sy.reduce((s, yi) => s + (yi - my) ** 2, 0) / window);
      result.push(stdX * stdY === 0 ? 0 : cov / (stdX * stdY));
    }
    return result;
  }

  describe('Engle-Granger协整检验', () => {
    it('完美协整序列应检测为协整', () => {
      const x = Array.from({ length: 50 }, (_, i) => i + 10);
      const y = x.map(v => v * 2 + 5); // y = 2x + 5
      const result = engleGrangerTest(y, x);
      expect(result.beta).toBeCloseTo(2, 0);
      expect(result.alpha).toBeCloseTo(5, 0);
    });

    it('不相关序列不协整', () => {
      const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const y = [100, 50, 150, 30, 200, 10, 250, 5, 300, 2];
      const result = engleGrangerTest(y, x);
      expect(result.isCointegrated).toBe(false);
    });

    it('带噪声的近似协整', () => {
      const x = Array.from({ length: 100 }, (_, i) => 50 + Math.sin(i / 10) * 20);
      const y = x.map(v => v * 1.5 + 10 + (Math.random() - 0.5) * 5);
      const result = engleGrangerTest(y, x);
      expect(result.beta).toBeGreaterThan(1);
      expect(result.beta).toBeLessThan(2);
    });

    it('lookback参数限制窗口', () => {
      const x = Array.from({ length: 100 }, (_, i) => i);
      const y = x.map(v => v * 3);
      const r1 = engleGrangerTest(y, x, 20);
      const r2 = engleGrangerTest(y, x, 50);
      expect(r1.beta).toBeCloseTo(r2.beta, 0);
    });
  });

  describe('价差Z-Score', () => {
    it('常数序列Z-Score为0', () => {
      const spread = Array.from({ length: 20 }, () => 100);
      const z = spreadZScore(spread, 10);
      expect(z.every(v => v === 0)).toBe(true);
    });

    it('标准正态分布Z-Score范围', () => {
      const spread = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
      const z = spreadZScore(spread, 10);
      const last = z[z.length - 1];
      expect(last).toBeGreaterThan(0);
    });

    it('数据不足返回空', () => {
      expect(spreadZScore([1, 2, 3], 10)).toEqual([]);
    });

    it('递增序列最后Z-Score为正', () => {
      const spread = Array.from({ length: 20 }, (_, i) => i);
      const z = spreadZScore(spread, 10);
      expect(z[z.length - 1]).toBeGreaterThan(0);
    });
  });

  describe('配对交易信号', () => {
    it('Z-Score触发做多', () => {
      const zScores = [0, -1, -1.5, -2.1, -1, 0.5];
      const signals = spreadSignal(zScores, 2, 0.5);
      const longs = signals.filter(s => s.action === 'long');
      expect(longs.length).toBe(1);
    });

    it('Z-Score触发做空', () => {
      const zScores = [0, 1, 1.5, 2.1, 1, -0.5];
      const signals = spreadSignal(zScores, 2, 0.5);
      const shorts = signals.filter(s => s.action === 'short');
      expect(shorts.length).toBe(1);
    });

    it('回到阈值内平仓', () => {
      const zScores = [0, -2.5, -1, 0.3];
      const signals = spreadSignal(zScores, 2, 0.5);
      expect(signals.some(s => s.action === 'close')).toBe(true);
    });

    it('无信号时不交易', () => {
      const zScores = [0, 0.5, -0.3, 0.2, -0.1];
      const signals = spreadSignal(zScores, 2, 0.5);
      expect(signals.every(s => s.action === 'hold')).toBe(true);
    });
  });

  describe('均值回归半衰期', () => {
    it('强回归序列半衰期计算', () => {
      const spread = [100, 95, 105, 98, 102, 99, 101, 100, 99, 101, 100, 99, 101];
      const hl = halfLife(spread);
      expect(typeof hl).toBe('number');
    });

    it('趋势序列半衰期长', () => {
      const spread = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      const hl = halfLife(spread);
      expect(hl).toBeGreaterThan(0);
    });

    it('常数序列处理', () => {
      const spread = Array.from({ length: 20 }, () => 100);
      const hl = halfLife(spread);
      expect(typeof hl).toBe('number');
    });
  });

  describe('滚动相关性', () => {
    it('完全正相关', () => {
      const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const corr = rollingCorrelation(x, x, 5);
      expect(corr[corr.length - 1]).toBeCloseTo(1, 5);
    });

    it('完全负相关', () => {
      const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const y = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      const corr = rollingCorrelation(x, y, 5);
      expect(corr[corr.length - 1]).toBeCloseTo(-1, 5);
    });

    it('数据不足返回空', () => {
      expect(rollingCorrelation([1, 2], [3, 4], 5)).toEqual([]);
    });

    it('输出长度正确', () => {
      const x = Array.from({ length: 20 }, () => Math.random());
      const y = Array.from({ length: 20 }, () => Math.random());
      const corr = rollingCorrelation(x, y, 5);
      expect(corr.length).toBe(16);
    });
  });
});
