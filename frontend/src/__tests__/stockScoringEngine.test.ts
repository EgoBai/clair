import { describe, it, expect } from 'vitest';

// 股票筛选评分系统
interface StockMetrics {
  symbol: string;
  pe: number;
  pb: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  revenueGrowth: number;
  profitGrowth: number;
  debtRatio: number;
  currentRatio: number;
  dividendYield: number;
  turnoverRate: number;
  price: number;
  change: number;
  marketCap: number;
}

function scoreStock(stock: StockMetrics, weights: Record<string, number> = {}): { totalScore: number; breakdown: Record<string, number> } {
  const defaultWeights = {
    valuation: 0.25,
    profitability: 0.25,
    growth: 0.2,
    financial_health: 0.15,
    dividend: 0.15,
    ...weights,
  };

  const breakdown: Record<string, number> = {};

  // 估值分 (PE越低越好, PB越低越好)
  const peScore = stock.pe > 0 ? Math.max(0, 100 - stock.pe) : 0;
  const pbScore = stock.pb > 0 ? Math.max(0, 100 - stock.pb * 10) : 0;
  breakdown.valuation = (peScore + pbScore) / 2;

  // 盈利能力
  const roeScore = Math.min(100, Math.max(0, stock.roe * 2));
  const marginScore = Math.min(100, stock.grossMargin * 100);
  breakdown.profitability = (roeScore + marginScore) / 2;

  // 成长性
  const revScore = Math.min(100, Math.max(0, 50 + stock.revenueGrowth));
  const profitScore = Math.min(100, Math.max(0, 50 + stock.profitGrowth));
  breakdown.growth = (revScore + profitScore) / 2;

  // 财务健康
  const debtScore = Math.max(0, 100 - stock.debtRatio * 100);
  const liquidityScore = Math.min(100, stock.currentRatio * 50);
  breakdown.financial_health = (debtScore + liquidityScore) / 2;

  // 股息
  breakdown.dividend = Math.min(100, stock.dividendYield * 20);

  const totalScore = Object.entries(breakdown).reduce(
    (sum, [key, score]) => sum + score * (defaultWeights[key as keyof typeof defaultWeights] || 0), 0
  );

  return { totalScore: +totalScore.toFixed(2), breakdown };
}

function rankStocks(stocks: StockMetrics[], weights?: Record<string, number>): { symbol: string; score: number; rank: number }[] {
  const scored = stocks.map(s => {
    const { totalScore } = scoreStock(s, weights);
    return { symbol: s.symbol, score: totalScore };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

function filterByStrategy(stocks: StockMetrics[], strategy: 'value' | 'growth' | 'quality' | 'dividend'): StockMetrics[] {
  switch (strategy) {
    case 'value':
      return stocks.filter(s => s.pe > 0 && s.pe < 15 && s.pb > 0 && s.pb < 2);
    case 'growth':
      return stocks.filter(s => s.revenueGrowth > 20 && s.profitGrowth > 15);
    case 'quality':
      return stocks.filter(s => s.roe > 15 && s.debtRatio < 0.5 && s.grossMargin > 0.3);
    case 'dividend':
      return stocks.filter(s => s.dividendYield > 3 && s.pe > 0 && s.pe < 20);
    default:
      return stocks;
  }
}

// 行业对比
function compareByIndustry(stocks: StockMetrics[], industryMap: Map<string, string>): Record<string, { avgPE: number; avgROE: number; count: number }> {
  const groups: Record<string, StockMetrics[]> = {};
  for (const s of stocks) {
    const industry = industryMap.get(s.symbol) || 'Unknown';
    (groups[industry] = groups[industry] || []).push(s);
  }
  const result: Record<string, { avgPE: number; avgROE: number; count: number }> = {};
  for (const [industry, items] of Object.entries(groups)) {
    result[industry] = {
      avgPE: +(items.reduce((s, i) => s + (i.pe > 0 ? i.pe : 0), 0) / items.length).toFixed(2),
      avgROE: +(items.reduce((s, i) => s + i.roe, 0) / items.length).toFixed(2),
      count: items.length,
    };
  }
  return result;
}

describe('股票筛选评分系统', () => {
  const sampleStocks: StockMetrics[] = [
    { symbol: '600519', pe: 25, pb: 8, roe: 30, grossMargin: 0.9, netMargin: 0.5, revenueGrowth: 15, profitGrowth: 20, debtRatio: 0.2, currentRatio: 3, dividendYield: 1.5, turnoverRate: 0.5, price: 1900, change: 2, marketCap: 20000 },
    { symbol: '000858', pe: 20, pb: 5, roe: 25, grossMargin: 0.7, netMargin: 0.35, revenueGrowth: 10, profitGrowth: 12, debtRatio: 0.3, currentRatio: 2, dividendYield: 2, turnoverRate: 0.8, price: 150, change: -1, marketCap: 5000 },
    { symbol: '000001', pe: 6, pb: 0.8, roe: 12, grossMargin: 0.4, netMargin: 0.3, revenueGrowth: 5, profitGrowth: 3, debtRatio: 0.9, currentRatio: 1.1, dividendYield: 5, turnoverRate: 0.3, price: 12, change: 0.5, marketCap: 3000 },
    { symbol: '300750', pe: 40, pb: 6, roe: 18, grossMargin: 0.25, netMargin: 0.1, revenueGrowth: 50, profitGrowth: 60, debtRatio: 0.55, currentRatio: 1.5, dividendYield: 0.3, turnoverRate: 1.2, price: 200, change: 3, marketCap: 8000 },
  ];

  describe('个股评分', () => {
    it('返回分数在0-100范围', () => {
      const { totalScore } = scoreStock(sampleStocks[0]);
      expect(totalScore).toBeGreaterThan(0);
      expect(totalScore).toBeLessThanOrEqual(100);
    });

    it('返回5个维度', () => {
      const { breakdown } = scoreStock(sampleStocks[0]);
      expect(Object.keys(breakdown)).toHaveLength(5);
    });

    it('低PE估值分高', () => {
      const lowPE = scoreStock({ ...sampleStocks[0], pe: 5 });
      const highPE = scoreStock({ ...sampleStocks[0], pe: 50 });
      expect(lowPE.breakdown.valuation).toBeGreaterThan(highPE.breakdown.valuation);
    });

    it('高ROE盈利分高', () => {
      const highROE = scoreStock({ ...sampleStocks[0], roe: 40 });
      const lowROE = scoreStock({ ...sampleStocks[0], roe: 5 });
      expect(highROE.breakdown.profitability).toBeGreaterThan(lowROE.breakdown.profitability);
    });

    it('自定义权重影响总分', () => {
      const s1 = scoreStock(sampleStocks[0], { valuation: 1, profitability: 0, growth: 0, financial_health: 0, dividend: 0 });
      const s2 = scoreStock(sampleStocks[0], { valuation: 0, profitability: 1, growth: 0, financial_health: 0, dividend: 0 });
      expect(s1.totalScore).not.toBe(s2.totalScore);
    });

    it('负PE估值分偏低', () => {
      const { breakdown } = scoreStock({ ...sampleStocks[0], pe: -10 });
      // PE negative → peScore=0, but PB still contributes
      expect(breakdown.valuation).toBeLessThan(50);
    });

    it('低负债健康分高', () => {
      const lowDebt = scoreStock({ ...sampleStocks[0], debtRatio: 0.1 });
      const highDebt = scoreStock({ ...sampleStocks[0], debtRatio: 0.9 });
      expect(lowDebt.breakdown.financial_health).toBeGreaterThan(highDebt.breakdown.financial_health);
    });
  });

  describe('排名', () => {
    it('按分数降序排列', () => {
      const ranked = rankStocks(sampleStocks);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
    });

    it('排名连续', () => {
      const ranked = rankStocks(sampleStocks);
      ranked.forEach((r, i) => expect(r.rank).toBe(i + 1));
    });

    it('单只股票排名为1', () => {
      const ranked = rankStocks([sampleStocks[0]]);
      expect(ranked[0].rank).toBe(1);
    });

    it('空数组返回空', () => {
      expect(rankStocks([])).toHaveLength(0);
    });
  });

  describe('策略筛选', () => {
    it('价值策略筛选低PE低PB', () => {
      const value = filterByStrategy(sampleStocks, 'value');
      value.forEach(s => {
        expect(s.pe).toBeLessThan(15);
        expect(s.pb).toBeLessThan(2);
      });
    });

    it('成长策略筛选高增长', () => {
      const growth = filterByStrategy(sampleStocks, 'growth');
      growth.forEach(s => {
        expect(s.revenueGrowth).toBeGreaterThan(20);
        expect(s.profitGrowth).toBeGreaterThan(15);
      });
    });

    it('质量策略筛选高ROE低负债', () => {
      const quality = filterByStrategy(sampleStocks, 'quality');
      quality.forEach(s => {
        expect(s.roe).toBeGreaterThan(15);
        expect(s.debtRatio).toBeLessThan(0.5);
      });
    });

    it('股息策略筛选高派息', () => {
      const dividend = filterByStrategy(sampleStocks, 'dividend');
      dividend.forEach(s => {
        expect(s.dividendYield).toBeGreaterThan(3);
      });
    });

    it('可能无匹配', () => {
      const strict = filterByStrategy(sampleStocks, 'value');
      // value stocks may or may not exist in sample
      expect(Array.isArray(strict)).toBe(true);
    });
  });

  describe('行业对比', () => {
    it('按行业分组', () => {
      const map = new Map([
        ['600519', '白酒'], ['000858', '白酒'], ['000001', '银行'], ['300750', '新能源'],
      ]);
      const result = compareByIndustry(sampleStocks, map);
      expect(Object.keys(result)).toHaveLength(3);
      expect(result['白酒'].count).toBe(2);
    });

    it('行业平均PE正确', () => {
      const map = new Map([['600519', '白酒'], ['000858', '白酒']]);
      const result = compareByIndustry(sampleStocks, map);
      expect(result['白酒'].avgPE).toBe(22.5);
    });

    it('空数据返回空', () => {
      expect(Object.keys(compareByIndustry([], new Map()))).toHaveLength(0);
    });
  });
});
