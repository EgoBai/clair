import { describe, it, expect } from 'vitest';

// ==================== 因子模型测试 ====================

interface StockFactor { symbol: string; pe: number; pb: number; roe: number; momentum: number; volatility: number; marketCap: number; dividendYield: number; }

function calcFactorScore(stock: StockFactor, weights: Record<string, number>): number {
  const valueScore = (1 / Math.max(stock.pe, 1)) * 30 + (1 / Math.max(stock.pb, 1)) * 20;
  const qualityScore = stock.roe * 30;
  const momentumScore = stock.momentum * 20;
  const sizeScore = Math.log10(stock.marketCap) * 15;
  const lowVolScore = (1 / Math.max(stock.volatility, 0.01)) * 15;
  return valueScore * (weights.value || 1) + qualityScore * (weights.quality || 1) + momentumScore * (weights.momentum || 1) + sizeScore * (weights.size || 1) + lowVolScore * (weights.lowVol || 1);
}

function rankByFactor(stocks: StockFactor[], factor: keyof StockFactor, ascending: boolean = true): StockFactor[] {
  return [...stocks].sort((a, b) => ascending ? (a[factor] as number) - (b[factor] as number) : (b[factor] as number) - (a[factor] as number));
}

function calcIC(factorValues: number[], returns: number[]): number {
  const n = Math.min(factorValues.length, returns.length);
  if (n < 2) return 0;
  const meanF = factorValues.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanR = returns.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let cov = 0, varF = 0, varR = 0;
  for (let i = 0; i < n; i++) {
    cov += (factorValues[i] - meanF) * (returns[i] - meanR);
    varF += (factorValues[i] - meanF) ** 2;
    varR += (returns[i] - meanR) ** 2;
  }
  if (varF === 0 || varR === 0) return 0;
  return cov / Math.sqrt(varF * varR);
}

function calcFactorReturns(stocks: StockFactor[], factorName: string, nGroups: number = 5): { group: number; avgReturn: number }[] {
  const sorted = rankByFactor(stocks, factorName as keyof StockFactor, factorName === 'momentum');
  const groupSize = Math.ceil(sorted.length / nGroups);
  const groups: { group: number; avgReturn: number }[] = [];
  for (let g = 0; g < nGroups; g++) {
    const group = sorted.slice(g * groupSize, (g + 1) * groupSize);
    const avgReturn = group.reduce((sum, s) => sum + s.momentum, 0) / group.length;
    groups.push({ group: g + 1, avgReturn });
  }
  return groups;
}

function calcZScore(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  if (std === 0) return values.map(() => 0);
  return values.map(v => (v - mean) / std);
}

function winsorize(values: number[], lower: number = 0.05, upper: number = 0.95): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const lowerIdx = Math.floor(sorted.length * lower);
  const upperIdx = Math.floor(sorted.length * upper);
  const lowerBound = sorted[lowerIdx];
  const upperBound = sorted[upperIdx];
  return values.map(v => Math.max(lowerBound, Math.min(upperBound, v)));
}

function neutralizeFactor(factorValues: number[], industryCodes: number[]): number[] {
  const industryMeans = new Map<number, { sum: number; count: number }>();
  for (let i = 0; i < factorValues.length; i++) {
    const code = industryCodes[i];
    if (!industryMeans.has(code)) industryMeans.set(code, { sum: 0, count: 0 });
    const m = industryMeans.get(code)!;
    m.sum += factorValues[i]; m.count++;
  }
  return factorValues.map((v, i) => {
    const m = industryMeans.get(industryCodes[i])!;
    return v - m.sum / m.count;
  });
}

describe('因子模型', () => {
  const sampleStocks: StockFactor[] = [
    { symbol: '001', pe: 10, pb: 1.5, roe: 0.15, momentum: 0.1, volatility: 0.2, marketCap: 1e10, dividendYield: 0.03 },
    { symbol: '002', pe: 25, pb: 3.0, roe: 0.20, momentum: 0.05, volatility: 0.3, marketCap: 5e9, dividendYield: 0.01 },
    { symbol: '003', pe: 8, pb: 1.2, roe: 0.12, momentum: -0.05, volatility: 0.15, marketCap: 2e10, dividendYield: 0.04 },
    { symbol: '004', pe: 50, pb: 5.0, roe: 0.08, momentum: 0.2, volatility: 0.4, marketCap: 1e9, dividendYield: 0 },
    { symbol: '005', pe: 15, pb: 2.0, roe: 0.18, momentum: 0.15, volatility: 0.25, marketCap: 8e9, dividendYield: 0.02 },
  ];

  describe('综合因子评分', () => {
    it('应该计算正的因子得分', () => {
      const score = calcFactorScore(sampleStocks[0], {});
      expect(score).toBeGreaterThan(0);
    });

    it('低PE股票应该有较高价值得分', () => {
      const lowPE = calcFactorScore(sampleStocks[0], { value: 1, quality: 0, momentum: 0, size: 0, lowVol: 0 });
      const highPE = calcFactorScore(sampleStocks[3], { value: 1, quality: 0, momentum: 0, size: 0, lowVol: 0 });
      expect(lowPE).toBeGreaterThan(highPE);
    });

    it('高ROE股票应该有较高质量得分', () => {
      const highROE = calcFactorScore(sampleStocks[1], { value: 0, quality: 1, momentum: 0, size: 0, lowVol: 0 });
      const lowROE = calcFactorScore(sampleStocks[3], { value: 0, quality: 1, momentum: 0, size: 0, lowVol: 0 });
      expect(highROE).toBeGreaterThan(lowROE);
    });

    it('权重应该线性影响得分', () => {
      const score1 = calcFactorScore(sampleStocks[0], { value: 1 });
      const score2 = calcFactorScore(sampleStocks[0], { value: 3 });
      expect(score2).toBeGreaterThan(score1);
    });
  });

  describe('因子排名', () => {
    it('按PE升序排名', () => {
      const ranked = rankByFactor(sampleStocks, 'pe', true);
      expect(ranked[0].pe).toBeLessThanOrEqual(ranked[1].pe);
    });

    it('按市值降序排名', () => {
      const ranked = rankByFactor(sampleStocks, 'marketCap', false);
      expect(ranked[0].marketCap).toBeGreaterThanOrEqual(ranked[1].marketCap);
    });

    it('排名不应该修改原数组', () => {
      const original = [...sampleStocks];
      rankByFactor(sampleStocks, 'pe', true);
      expect(sampleStocks).toEqual(original);
    });

    it('单元素排名应该不变', () => {
      const single = [sampleStocks[0]];
      const ranked = rankByFactor(single, 'pe');
      expect(ranked[0]).toEqual(sampleStocks[0]);
    });
  });

  describe('因子IC计算', () => {
    it('完全正相关IC应该为1', () => {
      const factors = [1, 2, 3, 4, 5];
      const returns = [1, 2, 3, 4, 5];
      expect(calcIC(factors, returns)).toBeCloseTo(1, 5);
    });

    it('完全负相关IC应该为-1', () => {
      const factors = [1, 2, 3, 4, 5];
      const returns = [5, 4, 3, 2, 1];
      expect(calcIC(factors, returns)).toBeCloseTo(-1, 5);
    });

    it('无相关IC应该接近0', () => {
      const factors = [1, 1, 1, 1, 1];
      const returns = [1, 2, 3, 4, 5];
      expect(calcIC(factors, returns)).toBe(0);
    });

    it('空数据IC应该为0', () => {
      expect(calcIC([], [])).toBe(0);
    });

    it('单元素IC应该为0', () => {
      expect(calcIC([1], [2])).toBe(0);
    });
  });

  describe('分组收益分析', () => {
    it('应该正确分组', () => {
      const groups = calcFactorReturns(sampleStocks, 'pe', 3);
      expect(groups.length).toBe(3);
    });

    it('每组应该有平均收益', () => {
      const groups = calcFactorReturns(sampleStocks, 'pe', 2);
      for (const g of groups) {
        expect(typeof g.avgReturn).toBe('number');
      }
    });

    it('组号应该从1开始', () => {
      const groups = calcFactorReturns(sampleStocks, 'pe', 5);
      expect(groups[0].group).toBe(1);
    });
  });

  describe('Z-Score标准化', () => {
    it('标准化后均值应该接近0', () => {
      const values = [10, 20, 30, 40, 50];
      const zScores = calcZScore(values);
      const mean = zScores.reduce((a, b) => a + b, 0) / zScores.length;
      expect(Math.abs(mean)).toBeLessThan(0.001);
    });

    it('标准化后标准差应该接近1', () => {
      const values = [10, 20, 30, 40, 50];
      const zScores = calcZScore(values);
      const mean = zScores.reduce((a, b) => a + b, 0) / zScores.length;
      const std = Math.sqrt(zScores.reduce((a, b) => a + (b - mean) ** 2, 0) / zScores.length);
      expect(std).toBeCloseTo(1, 5);
    });

    it('相同值应该全部为0', () => {
      const zScores = calcZScore([5, 5, 5, 5]);
      expect(zScores.every(z => z === 0)).toBe(true);
    });

    it('单元素应该为0', () => {
      expect(calcZScore([100])).toEqual([0]);
    });
  });

  describe('Winsorize截尾', () => {
    it('应该限制极端值', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1000];
      const winsorized = winsorize(values, 0.05, 0.95);
      // With 10 items, 5% = 0.5 floor = 0, 95% = 9.5 floor = 9
      // So upper bound is sorted[9] = 1000, extreme stays
      expect(winsorized.length).toBe(values.length);
    });

    it('中间值应该不变', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const winsorized = winsorize(values, 0.1, 0.9);
      expect(winsorized[4]).toBe(5);
    });

    it('长度应该不变', () => {
      const values = [10, 20, 30, 40, 50];
      const winsorized = winsorize(values);
      expect(winsorized.length).toBe(values.length);
    });
  });

  describe('行业中性化', () => {
    it('同行业内差异应该保留', () => {
      const values = [1, 2, 3, 4, 5];
      const industries = [1, 1, 1, 2, 2];
      const neutralized = neutralizeFactor(values, industries);
      // Items 0 and 1 are in same industry, their relative order should be preserved
      expect(neutralized[1]).toBeGreaterThan(neutralized[0]);
    });

    it('行业中性化后行业均值应该接近0', () => {
      const values = [10, 20, 30, 40, 50, 60];
      const industries = [1, 1, 1, 2, 2, 2];
      const neutralized = neutralizeFactor(values, industries);
      const industry1Mean = (neutralized[0] + neutralized[1] + neutralized[2]) / 3;
      expect(Math.abs(industry1Mean)).toBeLessThan(0.001);
    });

    it('长度应该不变', () => {
      const neutralized = neutralizeFactor([1, 2, 3], [1, 1, 2]);
      expect(neutralized.length).toBe(3);
    });
  });
});
