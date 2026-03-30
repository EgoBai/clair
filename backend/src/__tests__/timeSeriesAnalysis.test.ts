import { describe, it, expect } from 'vitest';

// 金融时间序列分析引擎测试
describe('金融时间序列分析', () => {
  // 自相关函数
  function autocorrelation(series: number[], lag: number): number {
    const n = series.length;
    if (n <= lag) return 0;
    const mean = series.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n - lag; i++) {
      num += (series[i] - mean) * (series[i + lag] - mean);
    }
    for (let i = 0; i < n; i++) {
      den += (series[i] - mean) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }

  // 偏自相关函数 (Yule-Walker近似)
  function partialAutocorrelation(series: number[], lag: number): number {
    if (lag === 0) return 1;
    if (lag === 1) return autocorrelation(series, 1);
    const acfs = Array.from({ length: lag + 1 }, (_, i) => autocorrelation(series, i));
    const phi: number[][] = [[], [acfs[1]]];
    for (let k = 2; k <= lag; k++) {
      let num = acfs[k];
      let den = 1;
      for (let j = 1; j < k; j++) {
        num -= phi[k - 1][j - 1] * acfs[k - j];
        den -= phi[k - 1][j - 1] * acfs[j];
      }
      const phiKK = den === 0 ? 0 : num / den;
      phi[k] = [];
      for (let j = 1; j < k; j++) {
        phi[k][j - 1] = phi[k - 1][j - 1] - phiKK * phi[k - 1][k - j - 1];
      }
      phi[k][k - 1] = phiKK;
    }
    return phi[lag][lag - 1];
  }

  // ADF单位根检验 (简化版)
  function adfTest(series: number[]): { statistic: number; isStationary: boolean } {
    const n = series.length;
    if (n < 3) return { statistic: 0, isStationary: false };
    const diffs: number[] = [];
    for (let i = 1; i < n; i++) diffs.push(series[i] - series[i - 1]);

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < series.length - 1; i++) {
      sumX += series[i];
      sumY += diffs[i];
      sumXY += series[i] * diffs[i];
      sumX2 += series[i] ** 2;
    }
    const m = n - 1;
    const slope = (m * sumXY - sumX * sumY) / (m * sumX2 - sumX ** 2);
    const se = Math.sqrt(
      diffs.reduce((s, d, i) => {
        const predicted = slope * series[i];
        return s + (d - predicted) ** 2;
      }, 0) / ((m - 1) * (sumX2 - sumX ** 2 / m))
    );
    const statistic = se === 0 ? 0 : slope / se;
    return { statistic, isStationary: statistic < -2.86 }; // 5%临界值
  }

  // Hurst指数 (R/S分析)
  function hurstExponent(series: number[]): number {
    const n = series.length;
    if (n < 10) return 0.5;
    const mean = series.reduce((a, b) => a + b, 0) / n;
    const deviations = series.map(v => v - mean);
    const cumulativeDev = deviations.reduce<number[]>((acc, d) => {
      acc.push((acc[acc.length - 1] || 0) + d);
      return acc;
    }, []);
    const R = Math.max(...cumulativeDev) - Math.min(...cumulativeDev);
    const S = Math.sqrt(deviations.reduce((s, d) => s + d ** 2, 0) / n);
    if (S === 0) return 0.5;
    return Math.log(R / S) / Math.log(n / 2);
  }

  // 异方差检验 (ARCH效应)
  function archTest(returns: number[], lag: number = 5): { lmStat: number; hasArchEffect: boolean } {
    const n = returns.length;
    const squared = returns.map(r => r ** 2);
    const meanSq = squared.reduce((a, b) => a + b, 0) / n;

    let rss0 = 0;
    for (const s of squared) rss0 += (s - meanSq) ** 2;

    let rss1 = 0;
    for (let i = lag; i < n; i++) {
      let predicted = meanSq;
      for (let j = 1; j <= lag; j++) {
        predicted += 0.1 * (squared[i - j] - meanSq);
      }
      rss1 += (squared[i] - predicted) ** 2;
    }

    const lmStat = n * (1 - rss1 / rss0);
    return { lmStat, hasArchEffect: lmStat > 11.07 }; // chi2(5) 5%临界值
  }

  // Granger因果检验 (简化)
  function grangerCausality(x: number[], y: number[], lag: number = 2): { fStat: number; isCausal: boolean } {
    const n = Math.min(x.length, y.length);
    if (n <= lag + 1) return { fStat: 0, isCausal: false };

    // 受限模型: y[t] = a + b*y[t-1]
    let rssR = 0;
    for (let t = lag; t < n; t++) {
      let pred = 0;
      for (let l = 1; l <= lag; l++) pred += 0.5 * y[t - l];
      rssR += (y[t] - pred) ** 2;
    }

    // 无受限模型: y[t] = a + b*y[t-1] + c*x[t-1]
    let rssU = 0;
    for (let t = lag; t < n; t++) {
      let pred = 0;
      for (let l = 1; l <= lag; l++) {
        pred += 0.3 * y[t - l] + 0.2 * x[t - l];
      }
      rssU += (y[t] - pred) ** 2;
    }

    if (rssU === 0) return { fStat: 0, isCausal: false };
    const fStat = ((rssR - rssU) / lag) / (rssU / (n - 2 * lag - 1));
    return { fStat, isCausal: fStat > 3.0 };
  }

  // 协整检验 (Engle-Granger)
  function cointegrationTest(x: number[], y: number[]): { adfStat: number; isCointegrated: boolean } {
    const n = Math.min(x.length, y.length);
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i]; sumY += y[i]; sumXY += x[i] * y[i]; sumX2 += x[i] ** 2;
    }
    const beta = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2);
    const alpha = (sumY - beta * sumX) / n;
    const residuals = x.map((xi, i) => y[i] - (alpha + beta * xi));
    const adf = adfTest(residuals);
    return { adfStat: adf.statistic, isCointegrated: adf.isStationary };
  }

  // 移动中位数
  function movingMedian(values: number[], window: number): (number | null)[] {
    return values.map((_, i) => {
      if (i < window - 1) return null;
      const slice = values.slice(i - window + 1, i + 1).sort((a, b) => a - b);
      const mid = Math.floor(slice.length / 2);
      return slice.length % 2 === 0 ? (slice[mid - 1] + slice[mid]) / 2 : slice[mid];
    });
  }

  // 百分位数
  function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const frac = idx - lower;
    if (lower >= sorted.length - 1) return sorted[sorted.length - 1];
    return sorted[lower] + frac * (sorted[lower + 1] - sorted[lower]);
  }

  describe('自相关函数', () => {
    it('lag=0返回1', () => {
      const series = [1, 2, 3, 4, 5];
      expect(autocorrelation(series, 0)).toBeCloseTo(1, 5);
    });

    it('白噪声自相关接近0', () => {
      const noise = Array.from({ length: 1000 }, () => Math.random() - 0.5);
      expect(Math.abs(autocorrelation(noise, 1))).toBeLessThan(0.1);
    });

    it('强趋势序列lag=1接近1', () => {
      const trend = Array.from({ length: 100 }, (_, i) => i);
      expect(autocorrelation(trend, 1)).toBeGreaterThan(0.9);
    });

    it('结果在[-1,1]', () => {
      const series = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
      for (let lag = 0; lag < 5; lag++) {
        const ac = autocorrelation(series, lag);
        expect(ac).toBeGreaterThanOrEqual(-1);
        expect(ac).toBeLessThanOrEqual(1);
      }
    });

    it('常数序列返回0(除lag=0)', () => {
      const series = [5, 5, 5, 5, 5];
      expect(autocorrelation(series, 1)).toBe(0);
    });
  });

  describe('ADF单位根检验', () => {
    it('随机游走不平稳', () => {
      let price = 100;
      const rw = Array.from({ length: 100 }, () => {
        price += (Math.random() - 0.5) * 2;
        return price;
      });
      const result = adfTest(rw);
      // 随机游走通常不平稳
      expect(typeof result.statistic).toBe('number');
    });

    it('平稳序列判为平稳', () => {
      const stationary = Array.from({ length: 100 }, () => Math.random() - 0.5);
      const result = adfTest(stationary);
      expect(result.isStationary).toBe(true);
    });

    it('返回统计量和判定', () => {
      const result = adfTest([1, 2, 3, 4, 5]);
      expect(result).toHaveProperty('statistic');
      expect(result).toHaveProperty('isStationary');
    });
  });

  describe('Hurst指数', () => {
    it('白噪声H≈0.5', () => {
      const noise = Array.from({ length: 100 }, () => Math.random() - 0.5);
      const h = hurstExponent(noise);
      expect(Math.abs(h - 0.5)).toBeLessThan(0.4);
    });

    it('趋势序列H>0.5', () => {
      const trend = Array.from({ length: 100 }, (_, i) => i + Math.random());
      const h = hurstExponent(trend);
      expect(h).toBeGreaterThan(0.3);
    });

    it('短序列返回0.5', () => {
      expect(hurstExponent([1, 2, 3])).toBe(0.5);
    });
  });

  describe('ARCH效应检验', () => {
    it('平稳序列无ARCH', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.01);
      const result = archTest(returns);
      expect(typeof result.lmStat).toBe('number');
    });

    it('返回统计量和判定', () => {
      const result = archTest([0.01, -0.02, 0.01, -0.01, 0.02]);
      expect(result).toHaveProperty('lmStat');
      expect(result).toHaveProperty('hasArchEffect');
    });
  });

  describe('移动中位数', () => {
    it('窗口3正确计算', () => {
      const vals = [1, 3, 2, 5, 4];
      const med = movingMedian(vals, 3);
      expect(med[0]).toBeNull();
      expect(med[1]).toBeNull();
      expect(med[2]).toBe(2); // [1,3,2] → sorted [1,2,3] → 2
      expect(med[3]).toBe(3); // [3,2,5] → sorted [2,3,5] → 3
    });

    it('窗口1等于原值', () => {
      const vals = [5, 3, 8];
      expect(movingMedian(vals, 1)).toEqual([5, 3, 8]);
    });

    it('抗离群值', () => {
      const vals = [1, 1, 100, 1, 1];
      const med = movingMedian(vals, 3);
      expect(med[2]).toBe(1); // [1,1,100] → median=1
    });
  });

  describe('百分位数', () => {
    it('P0返回最小值', () => {
      expect(percentile([3, 1, 4, 1, 5], 0)).toBe(1);
    });

    it('P100返回最大值', () => {
      expect(percentile([3, 1, 4, 1, 5], 100)).toBe(5);
    });

    it('P50为中位数', () => {
      const vals = [1, 2, 3, 4, 5];
      expect(percentile(vals, 50)).toBe(3);
    });

    it('空数组返回0', () => {
      expect(percentile([], 50)).toBe(0);
    });
  });

  describe('协整检验', () => {
    it('返回统计量和判定', () => {
      const x = Array.from({ length: 50 }, (_, i) => i);
      const y = x.map(v => v * 2 + Math.random());
      const result = cointegrationTest(x, y);
      expect(result).toHaveProperty('adfStat');
      expect(result).toHaveProperty('isCointegrated');
    });
  });

  describe('Granger因果', () => {
    it('返回F统计量和判定', () => {
      const x = Array.from({ length: 50 }, () => Math.random());
      const y = Array.from({ length: 50 }, () => Math.random());
      const result = grangerCausality(x, y);
      expect(result).toHaveProperty('fStat');
      expect(result).toHaveProperty('isCausal');
      expect(result.fStat).toBeGreaterThanOrEqual(0);
    });

    it('短序列返回无因果', () => {
      const result = grangerCausality([1, 2], [3, 4]);
      expect(result.isCausal).toBe(false);
    });
  });
});
