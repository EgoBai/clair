import { describe, it, expect } from 'vitest';

// 智能选股过滤引擎
interface FilterCriteria {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between' | 'in';
  value: number | string | [number, number] | string[];
  weight?: number;
}

interface StockCandidate {
  symbol: string;
  name: string;
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  netProfitGrowth: number;
  debtRatio: number;
  dividendYield: number;
  marketCap: number;
  sector: string;
  score: number;
}

function matchCriteria(stock: StockCandidate, criteria: FilterCriteria): boolean {
  const val = (stock as any)[criteria.field];
  if (val === undefined) return false;
  switch (criteria.operator) {
    case 'gt': return val > (criteria.value as number);
    case 'lt': return val < (criteria.value as number);
    case 'gte': return val >= (criteria.value as number);
    case 'lte': return val <= (criteria.value as number);
    case 'eq': return val === criteria.value;
    case 'between': {
      const [lo, hi] = criteria.value as [number, number];
      return val >= lo && val <= hi;
    }
    case 'in': return (criteria.value as string[]).includes(String(val));
    default: return false;
  }
}

function filterStocks(stocks: StockCandidate[], criteria: FilterCriteria[]): StockCandidate[] {
  return stocks.filter(s => criteria.every(c => matchCriteria(s, c)));
}

function scoreStock(stock: StockCandidate, weights: Record<string, number>): number {
  let score = 0;
  const norms: Record<string, (s: StockCandidate) => number> = {
    roe: s => Math.min(s.roe / 30, 1),
    revenueGrowth: s => Math.min(Math.max(s.revenueGrowth / 50, 0), 1),
    netProfitGrowth: s => Math.min(Math.max(s.netProfitGrowth / 50, 0), 1),
    pe: s => Math.max(1 - s.pe / 50, 0),
    pb: s => Math.max(1 - s.pb / 10, 0),
    debtRatio: s => Math.max(1 - s.debtRatio, 0),
    dividendYield: s => Math.min(s.dividendYield / 5, 1),
  };
  let totalWeight = 0;
  Object.entries(weights).forEach(([key, w]) => {
    if (norms[key]) {
      score += norms[key](stock) * w;
      totalWeight += w;
    }
  });
  return totalWeight > 0 ? (score / totalWeight) * 100 : 0;
}

function rankStocks(stocks: StockCandidate[], weights: Record<string, number>): StockCandidate[] {
  return stocks
    .map(s => ({ ...s, score: scoreStock(s, weights) }))
    .sort((a, b) => b.score - a.score);
}

function diversifyBySector(stocks: StockCandidate[], maxPerSector: number): StockCandidate[] {
  const sectorCount = new Map<string, number>();
  return stocks.filter(s => {
    const count = sectorCount.get(s.sector) || 0;
    if (count >= maxPerSector) return false;
    sectorCount.set(s.sector, count + 1);
    return true;
  });
}

describe('智能选股过滤引擎', () => {
  const stocks: StockCandidate[] = [
    { symbol: '000001', name: '平安银行', pe: 8, pb: 1.2, roe: 15, revenueGrowth: 20, netProfitGrowth: 25, debtRatio: 0.6, dividendYield: 3.5, marketCap: 3000, sector: '金融', score: 0 },
    { symbol: '000002', name: '万科A', pe: 12, pb: 1.5, roe: 18, revenueGrowth: 10, netProfitGrowth: 8, debtRatio: 0.75, dividendYield: 4.0, marketCap: 2500, sector: '地产', score: 0 },
    { symbol: '600519', name: '贵州茅台', pe: 35, pb: 12, roe: 30, revenueGrowth: 15, netProfitGrowth: 18, debtRatio: 0.2, dividendYield: 1.5, marketCap: 25000, sector: '消费', score: 0 },
    { symbol: '000858', name: '五粮液', pe: 25, pb: 6, roe: 25, revenueGrowth: 12, netProfitGrowth: 15, debtRatio: 0.25, dividendYield: 2.0, marketCap: 8000, sector: '消费', score: 0 },
    { symbol: '300750', name: '宁德时代', pe: 60, pb: 8, roe: 20, revenueGrowth: 80, netProfitGrowth: 100, debtRatio: 0.55, dividendYield: 0.3, marketCap: 12000, sector: '新能源', score: 0 },
  ];

  it('PE<10筛选应正确过滤', () => {
    const result = filterStocks(stocks, [{ field: 'pe', operator: 'lt', value: 10 }]);
    expect(result.length).toBe(1);
    expect(result[0].symbol).toBe('000001');
  });

  it('多条件组合筛选', () => {
    const result = filterStocks(stocks, [
      { field: 'pe', operator: 'lte', value: 30 },
      { field: 'roe', operator: 'gte', value: 15 },
    ]);
    expect(result.length).toBe(3);
  });

  it('between操作符', () => {
    const result = filterStocks(stocks, [{ field: 'pe', operator: 'between', value: [10, 30] as [number, number] }]);
    expect(result.every(s => s.pe >= 10 && s.pe <= 30)).toBe(true);
  });

  it('in操作符筛选行业', () => {
    const result = filterStocks(stocks, [{ field: 'sector', operator: 'in', value: ['消费', '金融'] }]);
    expect(result.length).toBe(3);
  });

  it('无匹配应返回空', () => {
    const result = filterStocks(stocks, [{ field: 'pe', operator: 'lt', value: 0 }]);
    expect(result.length).toBe(0);
  });

  it('应计算个股评分', () => {
    const weights = { roe: 3, pe: 2, revenueGrowth: 2 };
    const score = scoreStock(stocks[0], weights);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('应按评分排序', () => {
    const weights = { roe: 3, pe: 2, dividendYield: 1 };
    const ranked = rankStocks(stocks, weights);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
  });

  it('应按行业分散', () => {
    const ranked = rankStocks(stocks, { roe: 3 });
    const diversified = diversifyBySector(ranked, 1);
    const sectors = new Set(diversified.map(s => s.sector));
    expect(sectors.size).toBe(diversified.length);
  });

  it('行业限制为2应保留至多2只/行业', () => {
    const diversified = diversifyBySector(stocks, 2);
    const sectorCounts = new Map<string, number>();
    diversified.forEach(s => {
      sectorCounts.set(s.sector, (sectorCounts.get(s.sector) || 0) + 1);
    });
    sectorCounts.forEach(count => expect(count).toBeLessThanOrEqual(2));
  });

  it('空权重应返回零分', () => {
    expect(scoreStock(stocks[0], {})).toBe(0);
  });
});
