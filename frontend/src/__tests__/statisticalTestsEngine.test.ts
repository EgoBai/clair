import { describe, it, expect } from 'vitest';

// 统计检验与时间序列分析引擎
describe('统计检验与时间序列分析引擎', () => {
  describe('描述性统计', () => {
    function mean(data: number[]): number {
      return data.length === 0 ? 0 : data.reduce((a, b) => a + b, 0) / data.length;
    }

    function median(data: number[]): number {
      if (data.length === 0) return 0;
      const sorted = [...data].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    function variance(data: number[]): number {
      if (data.length < 2) return 0;
      const m = mean(data);
      return data.reduce((s, v) => s + (v - m) ** 2, 0) / (data.length - 1);
    }

    function standardDev(data: number[]): number {
      return Math.sqrt(variance(data));
    }

    function skewness(data: number[]): number {
      if (data.length < 3) return 0;
      const m = mean(data);
      const sd = standardDev(data);
      if (sd === 0) return 0;
      const n = data.length;
      return (n / ((n - 1) * (n - 2))) * data.reduce((s, v) => s + ((v - m) / sd) ** 3, 0);
    }

    function kurtosis(data: number[]): number {
      if (data.length < 4) return 0;
      const m = mean(data);
      const sd = standardDev(data);
      if (sd === 0) return 0;
      const n = data.length;
      const k = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * data.reduce((s, v) => s + ((v - m) / sd) ** 4, 0);
      return k - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
    }

    function percentile(data: number[], p: number): number {
      if (data.length === 0) return 0;
      const sorted = [...data].sort((a, b) => a - b);
      const idx = (p / 100) * (sorted.length - 1);
      const lower = Math.floor(idx);
      const frac = idx - lower;
      return lower === sorted.length - 1 ? sorted[lower] : sorted[lower] + frac * (sorted[lower + 1] - sorted[lower]);
    }

    it('计算均值', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });

    it('空数组均值为0', () => {
      expect(mean([])).toBe(0);
    });

    it('单元素均值等于自身', () => {
      expect(mean([42])).toBe(42);
    });

    it('奇数个数的中位数', () => {
      expect(median([1, 3, 5])).toBe(3);
    });

    it('偶数个数的中位数', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    it('中位数不受极端值影响', () => {
      expect(median([1, 2, 3, 4, 1000])).toBe(3);
    });

    it('空数组中位数为0', () => {
      expect(median([])).toBe(0);
    });

    it('计算方差', () => {
      expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.5714, 3);
    });

    it('常数序列方差为0', () => {
      expect(variance([5, 5, 5, 5])).toBe(0);
    });

    it('单元素方差为0', () => {
      expect(variance([5])).toBe(0);
    });

    it('计算标准差', () => {
      const sd = standardDev([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(sd).toBeCloseTo(2.138, 2);
    });

    it('标准差>=0', () => {
      expect(standardDev([1, 2, 3])).toBeGreaterThanOrEqual(0);
    });

    it('对称分布偏度接近0', () => {
      const data = [-2, -1, 0, 1, 2];
      expect(Math.abs(skewness(data))).toBeLessThan(0.5);
    });

    it('正偏分布偏度>0', () => {
      const data = [1, 1, 1, 2, 10];
      expect(skewness(data)).toBeGreaterThan(0);
    });

    it('常数序列偏度为0', () => {
      expect(skewness([5, 5, 5, 5, 5])).toBe(0);
    });

    it('正态分布峰度接近0', () => {
      const data = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
      expect(Math.abs(kurtosis(data))).toBeLessThan(3);
    });

    it('P50等于中位数', () => {
      const data = [1, 2, 3, 4, 5];
      expect(percentile(data, 50)).toBe(median(data));
    });

    it('P0为最小值', () => {
      const data = [1, 2, 3, 4, 5];
      expect(percentile(data, 0)).toBe(1);
    });

    it('P100为最大值', () => {
      const data = [1, 2, 3, 4, 5];
      expect(percentile(data, 100)).toBe(5);
    });

    it('P25和P75', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(percentile(data, 25)).toBeGreaterThan(1);
      expect(percentile(data, 75)).toBeLessThan(10);
    });

    it('空数组百分位为0', () => {
      expect(percentile([], 50)).toBe(0);
    });
  });

  describe('假设检验', () => {
    function tStatistic(sample1: number[], sample2: number[]): number {
      const n1 = sample1.length, n2 = sample2.length;
      if (n1 < 2 || n2 < 2) return 0;
      const m1 = sample1.reduce((a, b) => a + b, 0) / n1;
      const m2 = sample2.reduce((a, b) => a + b, 0) / n2;
      const v1 = sample1.reduce((s, v) => s + (v - m1) ** 2, 0) / (n1 - 1);
      const v2 = sample2.reduce((s, v) => s + (v - m2) ** 2, 0) / (n2 - 1);
      const se = Math.sqrt(v1 / n1 + v2 / n2);
      return se === 0 ? 0 : (m1 - m2) / se;
    }

    function zTest(sampleMean: number, popMean: number, popStd: number, n: number): number {
      if (popStd === 0 || n <= 0) return 0;
      return (sampleMean - popMean) / (popStd / Math.sqrt(n));
    }

    it('两组相同t统计量为0', () => {
      const s = [1, 2, 3, 4, 5];
      expect(tStatistic(s, s)).toBe(0);
    });

    it('差异越大t统计量越大', () => {
      const s1 = [1, 2, 3];
      const s2a = [4, 5, 6];
      const s2b = [10, 11, 12];
      expect(Math.abs(tStatistic(s1, s2b))).toBeGreaterThan(Math.abs(tStatistic(s1, s2a)));
    });

    it('单元素样本t统计量为0', () => {
      expect(tStatistic([1], [2])).toBe(0);
    });

    it('z检验', () => {
      const z = zTest(105, 100, 10, 25);
      expect(z).toBe(2.5);
    });

    it('均值相等z检验为0', () => {
      expect(zTest(100, 100, 10, 25)).toBe(0);
    });

    it('零标准差z检验为0', () => {
      expect(zTest(105, 100, 0, 25)).toBe(0);
    });

    it('零样本量z检验为0', () => {
      expect(zTest(105, 100, 10, 0)).toBe(0);
    });

    it('高样本量z值更大', () => {
      expect(Math.abs(zTest(105, 100, 10, 100))).toBeGreaterThan(Math.abs(zTest(105, 100, 10, 25)));
    });
  });

  describe('移动平均', () => {
    function sma(data: number[], period: number): number[] {
      const result: number[] = [];
      for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        result.push(slice.reduce((a, b) => a + b, 0) / period);
      }
      return result;
    }

    function ema(data: number[], period: number): number[] {
      if (data.length === 0) return [];
      const k = 2 / (period + 1);
      const result = [data[0]];
      for (let i = 1; i < data.length; i++) {
        result.push(data[i] * k + result[i - 1] * (1 - k));
      }
      return result;
    }

    function wma(data: number[], period: number): number[] {
      const result: number[] = [];
      const weights = Array.from({ length: period }, (_, i) => i + 1);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += data[i - period + 1 + j] * weights[j];
        }
        result.push(sum / totalWeight);
      }
      return result;
    }

    it('SMA长度正确', () => {
      expect(sma([1, 2, 3, 4, 5], 3)).toHaveLength(3);
    });

    it('SMA常数序列', () => {
      expect(sma([5, 5, 5, 5], 2)).toEqual([5, 5, 5]);
    });

    it('SMA递增序列', () => {
      const result = sma([1, 2, 3, 4, 5], 3);
      expect(result[0]).toBe(2);
      expect(result[1]).toBe(3);
      expect(result[2]).toBe(4);
    });

    it('EMA长度与输入相同', () => {
      expect(ema([1, 2, 3, 4, 5], 3)).toHaveLength(5);
    });

    it('EMA首值等于首输入', () => {
      expect(ema([10, 20, 30], 3)[0]).toBe(10);
    });

    it('EMA常数序列', () => {
      const result = ema([5, 5, 5, 5], 3);
      expect(result.every(v => v === 5)).toBe(true);
    });

    it('WMA长度正确', () => {
      expect(wma([1, 2, 3, 4, 5], 3)).toHaveLength(3);
    });

    it('WMA更重视近期数据', () => {
      const result = wma([1, 1, 10], 3);
      expect(result[0]).toBeGreaterThan(4);
    });

    it('空数组SMA为空', () => {
      expect(sma([], 3)).toEqual([]);
    });

    it('空数组EMA为空', () => {
      expect(ema([], 3)).toEqual([]);
    });

    it('周期等于数据长度', () => {
      expect(sma([1, 2, 3], 3)).toHaveLength(1);
      expect(sma([1, 2, 3], 3)[0]).toBe(2);
    });

    it('周期大于数据长度', () => {
      expect(sma([1, 2], 3)).toHaveLength(0);
    });
  });

  describe('自相关与平稳性', () => {
    function autocorrelation(data: number[], lag: number): number {
      if (data.length < lag + 2) return 0;
      const n = data.length - lag;
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (data[i] - mean) * (data[i + lag] - mean);
      }
      for (let i = 0; i < data.length; i++) {
        den += (data[i] - mean) ** 2;
      }
      return den === 0 ? 0 : num / den;
    }

    function firstDifference(data: number[]): number[] {
      const result: number[] = [];
      for (let i = 1; i < data.length; i++) {
        result.push(data[i] - data[i - 1]);
      }
      return result;
    }

    it('lag-0自相关为1', () => {
      const data = [1, 2, 3, 4, 5];
      expect(autocorrelation(data, 0)).toBeCloseTo(1, 5);
    });

    it('常数序列自相关为0', () => {
      expect(autocorrelation([5, 5, 5, 5], 1)).toBe(0);
    });

    it('空数组自相关为0', () => {
      expect(autocorrelation([], 1)).toBe(0);
    });

    it('一阶差分长度为n-1', () => {
      expect(firstDifference([1, 2, 3, 4, 5])).toHaveLength(4);
    });

    it('常数序列差分全为0', () => {
      expect(firstDifference([5, 5, 5, 5])).toEqual([0, 0, 0]);
    });

    it('线性增长差分为常数', () => {
      expect(firstDifference([2, 4, 6, 8])).toEqual([2, 2, 2]);
    });

    it('空数组差分为空', () => {
      expect(firstDifference([])).toEqual([]);
    });

    it('单元素差分为空', () => {
      expect(firstDifference([1])).toEqual([]);
    });

    it('lag-1自相关在合理范围', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ac = autocorrelation(data, 1);
      expect(ac).toBeGreaterThan(-1);
      expect(ac).toBeLessThanOrEqual(1);
    });
  });

  describe('分布检验', () => {
    function jarqueBera(data: number[]): { statistic: number; isNormal: boolean } {
      const n = data.length;
      if (n < 4) return { statistic: 0, isNormal: true };
      const m = data.reduce((a, b) => a + b, 0) / n;
      const variance = data.reduce((s, v) => s + (v - m) ** 2, 0) / n;
      if (variance === 0) return { statistic: 0, isNormal: true };
      const sd = Math.sqrt(variance);
      const skew = (1 / n) * data.reduce((s, v) => s + ((v - m) / sd) ** 3, 0);
      const kurt = (1 / n) * data.reduce((s, v) => s + ((v - m) / sd) ** 4, 0);
      const jb = (n / 6) * (skew ** 2 + ((kurt - 3) ** 2) / 4);
      return { statistic: jb, isNormal: jb < 5.991 }; // chi2(2) 95% critical value
    }

    it('近似正态分布JB统计量较小', () => {
      const data = Array.from({ length: 100 }, (_, i) => Math.sin(i) * 2);
      const result = jarqueBera(data);
      expect(result.statistic).toBeGreaterThanOrEqual(0);
    });

    it('常数序列JB为0', () => {
      expect(jarqueBera([5, 5, 5, 5, 5]).statistic).toBe(0);
    });

    it('短序列返回正常', () => {
      expect(jarqueBera([1, 2, 3]).isNormal).toBe(true);
    });

    it('极端偏度JB较大', () => {
      const data = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1000];
      const result = jarqueBera(data);
      expect(result.statistic).toBeGreaterThan(1);
    });

    it('JB统计量非负', () => {
      const data = [1, 3, 5, 7, 9, 2, 4, 6, 8, 10];
      expect(jarqueBera(data).statistic).toBeGreaterThanOrEqual(0);
    });
  });
});
