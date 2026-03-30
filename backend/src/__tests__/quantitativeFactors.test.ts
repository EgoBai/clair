import { describe, it, expect } from 'vitest';

// 量化因子模型引擎测试
describe('量化因子模型引擎', () => {
  // 因子定义
  interface Factor {
    name: string;
    weight: number;
    values: number[];
  }

  interface FactorScore {
    symbol: string;
    factors: Record<string, number>;
    totalScore: number;
    rank: number;
  }

  // 因子标准化 (Z-Score)
  function zScore(values: number[]): number[] {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    if (std === 0) return values.map(() => 0);
    return values.map(v => (v - mean) / std);
  }

  // 因子归一化到 [0, 1]
  function normalize(values: number[]): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return values.map(() => 0.5);
    return values.map(v => (v - min) / (max - min));
  }

  // 因子排名百分位
  function rankPercentile(values: number[]): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    return values.map(v => {
      const rank = sorted.findIndex(s => s >= v);
      return rank / (values.length - 1);
    });
  }

  // 多因子加权评分
  function multiFactorScore(
    stocks: Record<string, Record<string, number>>,
    factors: { name: string; weight: number; direction: 'long' | 'short' }[]
  ): FactorScore[] {
    const scores: FactorScore[] = [];
    for (const [symbol, stockFactors] of Object.entries(stocks)) {
      let totalScore = 0;
      const factorScores: Record<string, number> = {};
      for (const f of factors) {
        let val = stockFactors[f.name] ?? 0;
        if (f.direction === 'short') val = -val;
        factorScores[f.name] = val * f.weight;
        totalScore += factorScores[f.name];
      }
      scores.push({ symbol, factors: factorScores, totalScore, rank: 0 });
    }
    scores.sort((a, b) => b.totalScore - a.totalScore);
    scores.forEach((s, i) => (s.rank = i + 1));
    return scores;
  }

  // 因子IC计算 (信息系数)
  function factorIC(factorValues: number[], returns: number[]): number {
    const n = factorValues.length;
    if (n < 2) return 0;
    const meanF = factorValues.reduce((a, b) => a + b, 0) / n;
    const meanR = returns.reduce((a, b) => a + b, 0) / n;
    let cov = 0, varF = 0, varR = 0;
    for (let i = 0; i < n; i++) {
      cov += (factorValues[i] - meanF) * (returns[i] - meanR);
      varF += (factorValues[i] - meanF) ** 2;
      varR += (returns[i] - meanR) ** 2;
    }
    if (varF === 0 || varR === 0) return 0;
    return cov / Math.sqrt(varF * varR);
  }

  // 因子衰减加权
  function decayWeight(values: number[], halfLife: number): number[] {
    return values.map((v, i) => v * Math.pow(0.5, (values.length - 1 - i) / halfLife));
  }

  describe('Z-Score标准化', () => {
    it('标准正态序列均值接近0', () => {
      const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const zs = zScore(vals);
      const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
      expect(Math.abs(mean)).toBeLessThan(0.001);
    });

    it('相同值返回全零', () => {
      const vals = [5, 5, 5, 5, 5];
      const zs = zScore(vals);
      zs.forEach(z => expect(z).toBe(0));
    });

    it('两元素对称', () => {
      const vals = [10, 20];
      const zs = zScore(vals);
      expect(zs[0]).toBeLessThan(0);
      expect(zs[1]).toBeGreaterThan(0);
      expect(Math.abs(zs[0])).toBeCloseTo(Math.abs(zs[1]));
    });

    it('最大值对应最大Z值', () => {
      const vals = [3, 1, 4, 1, 5, 9, 2, 6];
      const zs = zScore(vals);
      const maxIdx = vals.indexOf(9);
      const maxZ = Math.max(...zs);
      expect(zs[maxIdx]).toBe(maxZ);
    });

    it('标准差接近1', () => {
      const vals = [10, 20, 30, 40, 50];
      const zs = zScore(vals);
      const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
      const std = Math.sqrt(zs.reduce((s, z) => s + (z - mean) ** 2, 0) / zs.length);
      expect(std).toBeCloseTo(1, 5);
    });
  });

  describe('归一化', () => {
    it('范围映射到[0,1]', () => {
      const vals = [10, 20, 30, 40, 50];
      const norm = normalize(vals);
      expect(Math.min(...norm)).toBeCloseTo(0);
      expect(Math.max(...norm)).toBeCloseTo(1);
    });

    it('相同值返回0.5', () => {
      const vals = [7, 7, 7, 7];
      const norm = normalize(vals);
      norm.forEach(n => expect(n).toBe(0.5));
    });

    it('保持顺序', () => {
      const vals = [5, 3, 8, 1, 9];
      const norm = normalize(vals);
      for (let i = 0; i < vals.length - 1; i++) {
        for (let j = i + 1; j < vals.length; j++) {
          if (vals[i] < vals[j]) expect(norm[i]).toBeLessThanOrEqual(norm[j]);
          if (vals[i] > vals[j]) expect(norm[i]).toBeGreaterThanOrEqual(norm[j]);
        }
      }
    });

    it('负值也能归一化', () => {
      const vals = [-100, -50, 0, 50, 100];
      const norm = normalize(vals);
      expect(norm[0]).toBeCloseTo(0);
      expect(norm[4]).toBeCloseTo(1);
      expect(norm[2]).toBeCloseTo(0.5);
    });
  });

  describe('排名百分位', () => {
    it('返回值在[0,1]范围', () => {
      const vals = [30, 10, 50, 20, 40];
      const rp = rankPercentile(vals);
      rp.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      });
    });

    it('最小值排名为0', () => {
      const vals = [3, 1, 4, 1, 5];
      const rp = rankPercentile(vals);
      const minIdx = vals.indexOf(1);
      expect(rp[minIdx]).toBe(0);
    });

    it('最大值排名为1', () => {
      const vals = [3, 1, 4, 1, 5];
      const rp = rankPercentile(vals);
      const maxIdx = vals.indexOf(5);
      expect(rp[maxIdx]).toBe(1);
    });
  });

  describe('多因子评分', () => {
    const stocks = {
      A: { value: 0.8, momentum: 0.6, quality: 0.9 },
      B: { value: 0.3, momentum: 0.9, quality: 0.4 },
      C: { value: 0.5, momentum: 0.5, quality: 0.5 },
    };
    const factors = [
      { name: 'value', weight: 0.4, direction: 'long' as const },
      { name: 'momentum', weight: 0.35, direction: 'long' as const },
      { name: 'quality', weight: 0.25, direction: 'long' as const },
    ];

    it('返回正确数量的评分', () => {
      const scores = multiFactorScore(stocks, factors);
      expect(scores).toHaveLength(3);
    });

    it('排名从1开始', () => {
      const scores = multiFactorScore(stocks, factors);
      scores.forEach(s => expect(s.rank).toBeGreaterThanOrEqual(1));
    });

    it('排名连续递增', () => {
      const scores = multiFactorScore(stocks, factors);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i].rank).toBe(scores[i - 1].rank + 1);
      }
    });

    it('总分递减排序', () => {
      const scores = multiFactorScore(stocks, factors);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i].totalScore).toBeLessThanOrEqual(scores[i - 1].totalScore);
      }
    });

    it('反向因子取负', () => {
      const shortFactors = [{ name: 'value', weight: 1, direction: 'short' as const }];
      const scores = multiFactorScore({ X: { value: 0.9 } }, shortFactors);
      expect(scores[0].totalScore).toBeLessThan(0);
    });

    it('权重归一化影响总分', () => {
      const f1 = [{ name: 'value', weight: 1, direction: 'long' as const }];
      const f2 = [{ name: 'value', weight: 0.5, direction: 'long' as const }];
      const s1 = multiFactorScore({ A: { value: 0.8 } }, f1);
      const s2 = multiFactorScore({ A: { value: 0.8 } }, f2);
      expect(s1[0].totalScore).toBe(s2[0].totalScore * 2);
    });
  });

  describe('因子IC', () => {
    it('完全正相关返回1', () => {
      const factor = [1, 2, 3, 4, 5];
      const returns = [10, 20, 30, 40, 50];
      expect(factorIC(factor, returns)).toBeCloseTo(1, 5);
    });

    it('完全负相关返回-1', () => {
      const factor = [1, 2, 3, 4, 5];
      const returns = [50, 40, 30, 20, 10];
      expect(factorIC(factor, returns)).toBeCloseTo(-1, 5);
    });

    it('无相关返回0', () => {
      const factor = [1, 1, 1, 1, 1];
      const returns = [10, 20, 30, 40, 50];
      expect(factorIC(factor, returns)).toBe(0);
    });

    it('单元素返回0', () => {
      expect(factorIC([5], [10])).toBe(0);
    });
  });

  describe('衰减加权', () => {
    it('最近值权重最大', () => {
      const vals = [1, 1, 1, 1, 100];
      const weighted = decayWeight(vals, 2);
      expect(weighted[4]).toBeGreaterThan(weighted[0]);
    });

    it('halfLife=1时衰减最快', () => {
      const vals = [1, 1, 1, 1, 1];
      const w1 = decayWeight(vals, 1);
      const w2 = decayWeight(vals, 10);
      expect(w1[0]).toBeLessThan(w2[0]);
    });

    it('所有值非负', () => {
      const vals = [1, 2, 3, 4, 5];
      const weighted = decayWeight(vals, 3);
      weighted.forEach(w => expect(w).toBeGreaterThanOrEqual(0));
    });
  });
});
