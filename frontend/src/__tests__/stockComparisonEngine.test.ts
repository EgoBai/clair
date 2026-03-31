import { describe, it, expect } from 'vitest';

/**
 * 股票对比引擎测试
 */

interface StockMetrics {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  marketCap: number;
  pe: number;
  pb: number;
  ps: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  debtRatio: number;
  currentRatio: number;
  revenueGrowth: number;
  profitGrowth: number;
  dividendYield: number;
  beta: number;
}

interface ComparisonResult {
  metrics: Array<{
    name: string;
    values: number[];
    best: number;
    worst: number;
    avg: number;
  }>;
  scores: number[];
  ranking: number[];
  summary: string;
}

function compareStocks(stocks: StockMetrics[]): ComparisonResult {
  if (stocks.length === 0) {
    return { metrics: [], scores: [], ranking: [], summary: '无数据' };
  }

  const metricDefs = [
    { name: 'ROE', key: 'roe', higher: true },
    { name: '毛利率', key: 'grossMargin', higher: true },
    { name: '净利率', key: 'netMargin', higher: true },
    { name: 'PE', key: 'pe', higher: false },
    { name: 'PB', key: 'pb', higher: false },
    { name: '营收增长', key: 'revenueGrowth', higher: true },
    { name: '利润增长', key: 'profitGrowth', higher: true },
    { name: '股息率', key: 'dividendYield', higher: true },
  ];

  const metrics = metricDefs.map(def => {
    const values = stocks.map(s => (s as any)[def.key] as number);
    const sorted = [...values].sort((a, b) => def.higher ? b - a : a - b);
    return {
      name: def.name,
      values,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
      avg: values.reduce((s, v) => s + v, 0) / values.length,
    };
  });

  const scores = stocks.map((_, i) => {
    let score = 0;
    metrics.forEach(m => {
      const rank = [...m.values].sort((a, b) => b - a).indexOf(m.values[i]);
      score += (stocks.length - rank) * (10 / stocks.length);
    });
    return Math.round(score * 10) / 10;
  });

  const ranking = [...scores]
    .map((score, i) => ({ score, index: i }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.index);

  const best = stocks[ranking[0]];
  const summary = `${best.name}综合评分最高 (${scores[ranking[0]]}分)`;

  return { metrics, scores, ranking, summary };
}

function normalizeMetrics(stocks: StockMetrics[]): StockMetrics[] {
  if (stocks.length === 0) return [];

  const fields: (keyof StockMetrics)[] = ['roe', 'grossMargin', 'netMargin', 'revenueGrowth', 'profitGrowth'];
  const minMax: Record<string, { min: number; max: number }> = {};

  for (const field of fields) {
    const values = stocks.map(s => s[field] as number);
    minMax[field as string] = { min: Math.min(...values), max: Math.max(...values) };
  }

  return stocks.map(s => {
    const normalized = { ...s };
    for (const field of fields) {
      const range = minMax[field as string];
      if (range.max > range.min) {
        (normalized as any)[field] = ((s[field] as number) - range.min) / (range.max - range.min);
      }
    }
    return normalized;
  });
}

describe('Stock Comparison Engine', () => {
  const stocks: StockMetrics[] = [
    {
      code: '600519', name: '贵州茅台', price: 1800, change: 50, changePercent: 2.8,
      volume: 1000000, turnover: 5e9, marketCap: 25000e8, pe: 35, pb: 10, ps: 15,
      roe: 30, grossMargin: 90, netMargin: 50, debtRatio: 0.2, currentRatio: 3,
      revenueGrowth: 15, profitGrowth: 18, dividendYield: 1.5, beta: 0.8,
    },
    {
      code: '000858', name: '五粮液', price: 150, change: 3, changePercent: 2,
      volume: 2000000, turnover: 3e9, marketCap: 8000e8, pe: 28, pb: 7, ps: 8,
      roe: 25, grossMargin: 80, netMargin: 35, debtRatio: 0.25, currentRatio: 2.5,
      revenueGrowth: 12, profitGrowth: 15, dividendYield: 1.2, beta: 0.9,
    },
    {
      code: '000001', name: '平安银行', price: 12.5, change: -0.2, changePercent: -1.6,
      volume: 5000000, turnover: 6e9, marketCap: 3000e8, pe: 5.5, pb: 0.7, ps: 1.5,
      roe: 12, grossMargin: 40, netMargin: 25, debtRatio: 0.9, currentRatio: 1.2,
      revenueGrowth: 8, profitGrowth: 10, dividendYield: 3, beta: 1.2,
    },
  ];

  describe('对比分析', () => {
    it('应该返回正确数量的指标', () => {
      const result = compareStocks(stocks);
      expect(result.metrics.length).toBe(8);
    });

    it('每个指标应该有正确的值', () => {
      const result = compareStocks(stocks);
      const roeMetric = result.metrics.find(m => m.name === 'ROE');
      expect(roeMetric).toBeDefined();
      expect(roeMetric!.values).toEqual([30, 25, 12]);
    });

    it('应该计算评分', () => {
      const result = compareStocks(stocks);
      expect(result.scores.length).toBe(3);
      expect(result.scores.every(s => s > 0)).toBe(true);
    });

    it('应该生成排名', () => {
      const result = compareStocks(stocks);
      expect(result.ranking.length).toBe(3);
      expect(new Set(result.ranking).size).toBe(3);
    });

    it('应该生成摘要', () => {
      const result = compareStocks(stocks);
      expect(result.summary).toContain('贵州茅台');
    });
  });

  describe('归一化', () => {
    it('应该归一化到0-1范围', () => {
      const normalized = normalizeMetrics(stocks);
      expect(normalized.length).toBe(3);
    });

    it('空数组应该返回空', () => {
      expect(normalizeMetrics([])).toEqual([]);
    });
  });

  describe('边界条件', () => {
    it('单只股票应该正常工作', () => {
      const result = compareStocks([stocks[0]]);
      expect(result.scores.length).toBe(1);
      expect(result.ranking).toEqual([0]);
    });

    it('空数组应该返回空结果', () => {
      const result = compareStocks([]);
      expect(result.metrics.length).toBe(0);
      expect(result.scores.length).toBe(0);
    });
  });
});
