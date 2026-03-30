import { describe, it, expect } from 'vitest';

// ===== 多因子选股模型测试 =====

interface StockFactor {
  symbol: string;
  name: string;
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  netProfitGrowth: number;
  debtRatio: number;
  currentRatio: number;
  dividendYield: number;
  turnoverRate: number;
  rsi: number;
  macdSignal: number;
  priceToMA20: number;
  priceToMA60: number;
}

function normalizeFactor(values: number[], reverse: boolean = false): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map(v => {
    const norm = (v - min) / range;
    return reverse ? 1 - norm : norm;
  });
}

function calculateFactorScore(stock: StockFactor, weights: Record<string, number>): number {
  const factors: Record<string, number> = {
    value: (1 / Math.max(stock.pe, 0.1)) * 0.5 + (1 / Math.max(stock.pb, 0.1)) * 0.5,
    quality: stock.roe / 30 * 0.4 + (1 - stock.debtRatio / 100) * 0.3 + stock.currentRatio / 3 * 0.3,
    growth: stock.revenueGrowth / 100 * 0.5 + stock.netProfitGrowth / 100 * 0.5,
    momentum: (stock.priceToMA20 > 1 ? 0.6 : 0.4) * 0.5 + (stock.priceToMA60 > 1 ? 0.6 : 0.4) * 0.5,
    technical: (stock.rsi < 70 && stock.rsi > 30 ? 0.6 : 0.3) * 0.5 + (stock.macdSignal > 0 ? 0.6 : 0.4) * 0.5,
    dividend: stock.dividendYield / 5,
  };
  let score = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (factors[key] !== undefined) {
      score += factors[key] * weight;
      totalWeight += weight;
    }
  }
  return totalWeight > 0 ? (score / totalWeight) * 100 : 0;
}

function rankStocks(stocks: StockFactor[], weights: Record<string, number>): Array<{ symbol: string; score: number; rank: number }> {
  const scored = stocks.map(s => ({ symbol: s.symbol, score: calculateFactorScore(s, weights) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

function filterByFactors(stocks: StockFactor[], criteria: Partial<Record<keyof StockFactor, { min?: number; max?: number }>>): StockFactor[] {
  return stocks.filter(s => {
    for (const [key, range] of Object.entries(criteria)) {
      const val = s[key as keyof StockFactor];
      if (typeof val !== 'number') continue;
      if (range.min !== undefined && val < range.min) return false;
      if (range.max !== undefined && val > range.max) return false;
    }
    return true;
  });
}

function calculateIC(factorValues: number[], returns: number[]): number {
  if (factorValues.length !== returns.length || factorValues.length < 2) return 0;
  const n = factorValues.length;
  const fMean = factorValues.reduce((a, b) => a + b, 0) / n;
  const rMean = returns.reduce((a, b) => a + b, 0) / n;
  let cov = 0, fVar = 0, rVar = 0;
  for (let i = 0; i < n; i++) {
    cov += (factorValues[i] - fMean) * (returns[i] - rMean);
    fVar += (factorValues[i] - fMean) ** 2;
    rVar += (returns[i] - rMean) ** 2;
  }
  const denom = Math.sqrt(fVar * rVar);
  return denom > 0 ? cov / denom : 0;
}

describe('多因子选股模型', () => {
  const sampleStocks: StockFactor[] = [
    { symbol: '600519', name: '茅台', pe: 30, pb: 8, roe: 25, revenueGrowth: 15, netProfitGrowth: 18, debtRatio: 20, currentRatio: 3, dividendYield: 2, turnoverRate: 0.5, rsi: 55, macdSignal: 0.5, priceToMA20: 1.02, priceToMA60: 1.05 },
    { symbol: '000858', name: '五粮液', pe: 25, pb: 6, roe: 22, revenueGrowth: 12, netProfitGrowth: 15, debtRatio: 25, currentRatio: 2.5, dividendYield: 1.5, turnoverRate: 0.8, rsi: 60, macdSignal: 0.3, priceToMA20: 1.01, priceToMA60: 1.03 },
    { symbol: '300750', name: '宁德时代', pe: 50, pb: 10, roe: 15, revenueGrowth: 50, netProfitGrowth: 40, debtRatio: 60, currentRatio: 1.5, dividendYield: 0.5, turnoverRate: 1.5, rsi: 45, macdSignal: -0.2, priceToMA20: 0.98, priceToMA60: 0.95 },
    { symbol: '000001', name: '平安银行', pe: 6, pb: 0.7, roe: 12, revenueGrowth: 8, netProfitGrowth: 10, debtRatio: 90, currentRatio: 1, dividendYield: 4, turnoverRate: 0.3, rsi: 35, macdSignal: 0.1, priceToMA20: 1.0, priceToMA60: 0.98 },
  ];

  const defaultWeights = { value: 0.25, quality: 0.2, growth: 0.2, momentum: 0.15, technical: 0.1, dividend: 0.1 };

  describe('因子标准化', () => {
    it('标准化到0-1范围', () => {
      const result = normalizeFactor([10, 20, 30, 40, 50]);
      expect(result[0]).toBe(0);
      expect(result[4]).toBe(1);
      expect(result[2]).toBe(0.5);
    });

    it('反向标准化', () => {
      const result = normalizeFactor([10, 20, 30, 40, 50], true);
      expect(result[0]).toBe(1);
      expect(result[4]).toBe(0);
    });

    it('相同值标准化为0.5', () => {
      const result = normalizeFactor([10, 10, 10]);
      expect(result.every(v => v === 0.5)).toBe(true);
    });

    it('单值标准化为0.5', () => {
      const result = normalizeFactor([42]);
      expect(result[0]).toBe(0.5);
    });

    it('负值标准化', () => {
      const result = normalizeFactor([-10, 0, 10]);
      expect(result[0]).toBe(0);
      expect(result[2]).toBe(1);
    });
  });

  describe('因子评分', () => {
    it('返回0-100范围分数', () => {
      const score = calculateFactorScore(sampleStocks[0], defaultWeights);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('低PE高ROE获得高分', () => {
      const goodValue: StockFactor = { ...sampleStocks[0], pe: 5, pb: 1, roe: 30 };
      const badValue: StockFactor = { ...sampleStocks[0], pe: 100, pb: 20, roe: 5 };
      expect(calculateFactorScore(goodValue, { value: 1, quality: 0, growth: 0, momentum: 0, technical: 0, dividend: 0 }))
        .toBeGreaterThan(calculateFactorScore(badValue, { value: 1, quality: 0, growth: 0, momentum: 0, technical: 0, dividend: 0 }));
    });

    it('高增长获得高成长分', () => {
      const highGrowth: StockFactor = { ...sampleStocks[0], revenueGrowth: 100, netProfitGrowth: 100 };
      const lowGrowth: StockFactor = { ...sampleStocks[0], revenueGrowth: 0, netProfitGrowth: 0 };
      expect(calculateFactorScore(highGrowth, { value: 0, quality: 0, growth: 1, momentum: 0, technical: 0, dividend: 0 }))
        .toBeGreaterThan(calculateFactorScore(lowGrowth, { value: 0, quality: 0, growth: 1, momentum: 0, technical: 0, dividend: 0 }));
    });

    it('零权重因子不影响分数', () => {
      const score1 = calculateFactorScore(sampleStocks[0], { value: 1, quality: 0, growth: 0, momentum: 0, technical: 0, dividend: 0 });
      const score2 = calculateFactorScore(sampleStocks[0], { value: 1 });
      expect(score1).toBe(score2);
    });

    it('空权重返回0', () => {
      expect(calculateFactorScore(sampleStocks[0], {})).toBe(0);
    });
  });

  describe('股票排名', () => {
    it('按分数降序排名', () => {
      const ranked = rankStocks(sampleStocks, defaultWeights);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
    });

    it('排名从1开始连续', () => {
      const ranked = rankStocks(sampleStocks, defaultWeights);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[ranked.length - 1].rank).toBe(ranked.length);
    });

    it('保留原始代码', () => {
      const ranked = rankStocks(sampleStocks, defaultWeights);
      const codes = ranked.map(r => r.symbol);
      sampleStocks.forEach(s => expect(codes).toContain(s.symbol));
    });

    it('单只股票排名为1', () => {
      const ranked = rankStocks([sampleStocks[0]], defaultWeights);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].rank).toBe(1);
    });
  });

  describe('因子筛选', () => {
    it('PE范围筛选', () => {
      const result = filterByFactors(sampleStocks, { pe: { max: 30 } });
      expect(result.every(s => s.pe <= 30)).toBe(true);
    });

    it('ROE最小值筛选', () => {
      const result = filterByFactors(sampleStocks, { roe: { min: 20 } });
      expect(result.every(s => s.roe >= 20)).toBe(true);
    });

    it('组合条件筛选', () => {
      const result = filterByFactors(sampleStocks, { pe: { max: 30 }, roe: { min: 15 }, debtRatio: { max: 50 } });
      result.forEach(s => {
        expect(s.pe).toBeLessThanOrEqual(30);
        expect(s.roe).toBeGreaterThanOrEqual(15);
        expect(s.debtRatio).toBeLessThanOrEqual(50);
      });
    });

    it('无匹配返回空', () => {
      const result = filterByFactors(sampleStocks, { pe: { max: 1 } });
      expect(result).toHaveLength(0);
    });

    it('无条件返回全部', () => {
      expect(filterByFactors(sampleStocks, {})).toHaveLength(sampleStocks.length);
    });
  });

  describe('IC因子有效性', () => {
    it('完全正相关IC=1', () => {
      const factors = [1, 2, 3, 4, 5];
      const returns = [0.01, 0.02, 0.03, 0.04, 0.05];
      expect(calculateIC(factors, returns)).toBeCloseTo(1, 5);
    });

    it('完全负相关IC=-1', () => {
      const factors = [1, 2, 3, 4, 5];
      const returns = [0.05, 0.04, 0.03, 0.02, 0.01];
      expect(calculateIC(factors, returns)).toBeCloseTo(-1, 5);
    });

    it('无相关IC≈0', () => {
      const factors = [1, 2, 3, 4, 5];
      const returns = [0.03, 0.01, 0.04, 0.02, 0.03];
      const ic = calculateIC(factors, returns);
      expect(Math.abs(ic)).toBeLessThan(0.5);
    });

    it('数据不足返回0', () => {
      expect(calculateIC([1], [0.01])).toBe(0);
    });

    it('长度不匹配返回0', () => {
      expect(calculateIC([1, 2], [0.01])).toBe(0);
    });

    it('常量因子返回0', () => {
      expect(calculateIC([5, 5, 5, 5], [0.01, 0.02, 0.03, 0.04])).toBe(0);
    });
  });
});
